import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { request } from 'node:http'
import { Pool } from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import {
  readExecutionHistory,
  recoverExecutions,
  registerResultReceiver,
  runExecution,
  useAiQueue,
} from '../modules/ai/index.ts'
import { openAiProvider } from '../modules/ai/infrastructure/adapters/openai.ts'
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
import {
  createCompany,
  CompanyConflict,
  readCompanyResearch,
  requestResearch,
  researchReceiver,
  researchSettingsKey,
  ResearchConfigurationError,
} from '../modules/companies/index.ts'
import {
  draft,
  pricing,
  researchMigrations,
  searchResponse,
  synthesisResponse,
} from './company-research.fixtures.ts'
import { recordingQueue } from './matching-ai.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'

// The settings and price lists AI keeps in code, replaced for the test.
vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

/**
 * Company research through the AI contract, with OpenAI simulated by its
 * transport (AC-AC01, E04-AC01–AC04): the agent adapter searches and
 * writes the report, Companies validate and publish it.
 */
const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'company research through the AI contract in isolated PostgreSQL',
  () => {
    const schema = `research_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool, pool: Pool, companyId: string
    const queue = recordingQueue()
    /** The simulated transport of OpenAI; each test sets its answers. */
    let fetcher = vi.fn<typeof fetch>()
    const command = (refresh = false) => ({ commandId: randomUUID(), refresh })
    const mockedProvider = () =>
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(searchResponse()))
        .mockResolvedValueOnce(Response.json(synthesisResponse()))
    const count = async (sql: string) =>
      (await pool.query(sql)).rows[0].n as number
    const executionOf = async (researchId: string) =>
      (
        await pool.query(
          'SELECT execution_id FROM company_research WHERE id=$1',
          [researchId],
        )
      ).rows[0].execution_id as string
    /** Runs the queued AI work of the research with the given transport. */
    async function execute(researchId: string, transport: typeof fetch) {
      fetcher = transport as ReturnType<typeof vi.fn<typeof fetch>>
      await runExecution(await executionOf(researchId))
    }
    const operation = async (id: string) =>
      (await readCompanyResearch(companyId)).operations.find((o) => o.id === id)

    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
        max: 10,
      })
      setPool(pool)
      const sql: string[] = []
      for (const migration of [
        ...researchMigrations,
        '1770000000019_research_ai_executions',
      ])
        createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
          sql: (s: string) => sql.push(s),
        })
      await pool.query(sql.join('\n'))
      useAiQueue(queue.boss)
      registerProviderAdapter(
        openAiProvider((input, init) => fetcher(input, init)),
      )
      registerResultReceiver(researchSettingsKey, researchReceiver)
    })
    beforeEach(async () => {
      vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-send')
      usePricing('research', pricing, 'agent')
      queue.reset()
      fetcher = vi.fn<typeof fetch>()
      await pool.query(
        'TRUNCATE company_research_commands,company_research,ai_attempts,ai_executions,ai_budget_months,company_commands,companies CASCADE',
      )
      companyId = (
        await createCompany({
          commandId: randomUUID(),
          name: 'Research company',
          kind: 'brand',
          website: 'https://company.example',
          description: 'Owner supplied',
        })
      ).id
    })
    afterAll(async () => {
      vi.unstubAllEnvs()
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })

    it('E04-AC01: deduplicates concurrent commands and rejects a changed command payload without another reservation', async () => {
      const value = command()
      const same = await Promise.all([
        requestResearch(companyId, value),
        requestResearch(companyId, value),
      ])
      expect(same[0]).toEqual(same[1])
      const concurrent = await Promise.all([
        requestResearch(companyId, command(true)),
        requestResearch(companyId, command()),
      ])
      expect(concurrent).toEqual([
        { id: same[0]!.id, reused: true },
        { id: same[0]!.id, reused: true },
      ])
      await expect(
        requestResearch(companyId, { ...value, refresh: true }),
      ).rejects.toBeInstanceOf(CompanyConflict)
      expect(queue.executionJobs()).toHaveLength(1)
      expect(await count('SELECT count(*)::int AS n FROM ai_attempts')).toBe(1)
    })

    it('AC-AC01: executes one paid research only, settles both steps and reuses the published report without current configuration', async () => {
      const op = await requestResearch(companyId, command())
      const executionId = await executionOf(op.id)
      fetcher = mockedProvider()
      await Promise.all([runExecution(executionId), runExecution(executionId)])
      await runExecution(executionId)
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(await operation(op.id)).toMatchObject({
        state: 'completed',
        cost: '0.073680',
        reserved: '0.536000',
        costState: 'settled',
        error: null,
        report: { claims: expect.any(Array) },
      })
      // The cost covers both steps, the search with its call price.
      const attempt = (await pool.query('SELECT * FROM ai_attempts')).rows[0]
      expect(attempt).toMatchObject({
        state: 'settled',
        response_id: 'search-id,synthesis-id',
        usage: { input_tokens: 8300, output_tokens: 120, tool_calls: 1 },
      })
      // The agent's step log keeps the usage of each step.
      const state = (
        await pool.query('SELECT adapter_state FROM ai_executions')
      ).rows[0].adapter_state
      expect(state.steps).toMatchObject([
        {
          step: 'search',
          status: 'completed',
          usage: { inputTokens: 100, outputTokens: 50, toolCalls: 1 },
        },
        {
          step: 'synthesis',
          status: 'completed',
          usage: { inputTokens: 200, outputTokens: 70, toolCalls: 0 },
        },
      ])
      usePricing('research', null)
      expect(await requestResearch(companyId, command())).toEqual({
        id: op.id,
        reused: true,
      })
      expect(queue.executionJobs()).toHaveLength(1)
      expect(await count('SELECT count(*)::int AS n FROM ai_attempts')).toBe(1)
    })

    it('E04-AC01: keeps both published versions after a successful explicit refresh', async () => {
      const first = await requestResearch(companyId, command())
      await execute(first.id, mockedProvider())
      await pool.query(
        "UPDATE companies SET name='Changed owner name' WHERE id=$1",
        [companyId],
      )
      const second = await requestResearch(companyId, command(true))
      await execute(second.id, mockedProvider())
      const operations = (await readCompanyResearch(companyId)).operations
      expect(operations).toHaveLength(2)
      expect(operations.find((o) => o.id === first.id)).toMatchObject({
        state: 'completed',
        target: { name: 'Research company' },
        report: { claims: expect.any(Array) },
      })
      expect(operations.find((o) => o.id === second.id)).toMatchObject({
        state: 'completed',
        target: { name: 'Changed owner name' },
        report: { claims: expect.any(Array) },
      })
      expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).input).toBe(
        JSON.stringify({
          name: 'Changed owner name',
          kind: 'brand',
          website: 'https://company.example',
          description: 'Owner supplied',
        }),
      )
      expect(await requestResearch(companyId, command())).toEqual({
        id: second.id,
        reused: true,
      })
      expect(queue.executionJobs()).toHaveLength(2)
      expect(await count('SELECT count(*)::int AS n FROM ai_attempts')).toBe(2)
    })

    it('E04-AC04: keeps the previous published version and target when a refresh ends with an unknown outcome, and never sends again', async () => {
      const original = await requestResearch(companyId, command())
      await execute(original.id, mockedProvider())
      await pool.query(
        "UPDATE companies SET name='Changed owner name' WHERE id=$1",
        [companyId],
      )
      const refreshed = await requestResearch(companyId, command(true))
      expect(refreshed.id).not.toBe(original.id)
      const failing = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('Ambiguous transport failure'))
      await execute(refreshed.id, failing)
      await execute(refreshed.id, failing)
      await recoverExecutions()
      await queue.work()
      expect(failing).toHaveBeenCalledTimes(1)
      const operations = (await readCompanyResearch(companyId)).operations
      expect(operations.find((o) => o.id === original.id)).toMatchObject({
        state: 'completed',
        target: { name: 'Research company' },
        report: { claims: expect.any(Array) },
      })
      expect(operations.find((o) => o.id === refreshed.id)).toMatchObject({
        state: 'unknown',
        target: { name: 'Changed owner name' },
        report: null,
        cost: null,
        costState: 'unknown',
        reserved: '0.536000',
        error: expect.any(String),
      })
      expect(await requestResearch(companyId, command())).toEqual({
        id: original.id,
        reused: true,
      })
    })

    it.each(['uncited search', 'all-unknown synthesis'])(
      'E04-AC02: settles a failed %s refresh and preserves the previous report without retrying',
      async (failure) => {
        const original = await requestResearch(companyId, command())
        await execute(original.id, mockedProvider())
        const refreshed = await requestResearch(companyId, command(true))
        const searched = searchResponse()
        const synthesized = synthesisResponse()
        if (failure === 'uncited search')
          searched.output[1]!.content![0]!.annotations = []
        else
          synthesized.output[0]!.content[0]!.text = JSON.stringify({
            ...draft(),
            claims: draft().claims.map((claim) => ({
              ...claim,
              kind: 'unknown',
              evidence: [],
            })),
          })
        const transport = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(Response.json(searched))
          .mockResolvedValueOnce(Response.json(synthesized))
        await execute(refreshed.id, transport)
        await execute(refreshed.id, transport)
        const calls = failure === 'uncited search' ? 1 : 2
        const cost = failure === 'uncited search' ? '0.072600' : '0.073680'
        expect(transport).toHaveBeenCalledTimes(calls)
        const operations = (await readCompanyResearch(companyId)).operations
        expect(operations.find((op) => op.id === refreshed.id)).toMatchObject({
          state: 'failed',
          report: null,
          costState: 'settled',
          cost,
          error:
            failure === 'uncited search'
              ? expect.stringContaining('Nie przygotowano raportu')
              : expect.stringContaining('Nie uznano go za gotowy research'),
        })
        expect(operations.find((op) => op.id === original.id)).toMatchObject({
          state: 'completed',
          report: { claims: expect.any(Array) },
        })
        expect(await requestResearch(companyId, command())).toEqual({
          id: original.id,
          reused: true,
        })
        expect(queue.executionJobs()).toHaveLength(2)
      },
    )

    it('E04-AC02: rejects a report with a fabricated quote, settles it and keeps the previous report', async () => {
      const original = await requestResearch(companyId, command())
      await execute(original.id, mockedProvider())
      const refreshed = await requestResearch(companyId, command(true))
      const synthesized = synthesisResponse()
      const fabricated = draft()
      fabricated.claims[0]!.evidence = [{ id: 0, quote: 'Project uses Go.' }]
      synthesized.output[0]!.content[0]!.text = JSON.stringify(fabricated)
      await execute(
        refreshed.id,
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(Response.json(searchResponse()))
          .mockResolvedValueOnce(Response.json(synthesized)),
      )
      expect(await operation(refreshed.id)).toMatchObject({
        state: 'failed',
        report: null,
        costState: 'settled',
        cost: '0.073680',
        error:
          'Nie udało się uzyskać kompletnego raportu z dowodami (validation). Poprzedni raport pozostaje dostępny.',
      })
      expect(await readExecutionHistory(refreshed.id)).toMatchObject([
        { state: 'rejected', rejectionReason: 'invalid_report' },
      ])
      expect(await requestResearch(companyId, command())).toEqual({
        id: original.id,
        reused: true,
      })
    })

    it('E04-AC03: keeps the measured search when the synthesis fails after it, leaves the cost unknown and publishes nothing', async () => {
      const op = await requestResearch(companyId, command())
      await execute(
        op.id,
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(Response.json(searchResponse()))
          .mockRejectedValueOnce(new Error('Disconnected after submission')),
      )
      expect(await operation(op.id)).toMatchObject({
        state: 'unknown',
        report: null,
        cost: null,
        costState: 'unknown',
        reserved: '0.536000',
      })
      const attempt = (await pool.query('SELECT * FROM ai_attempts')).rows[0]
      expect(attempt).toMatchObject({
        state: 'unknown',
        actual_pln: null,
        response_id: 'search-id',
        usage: { input_tokens: 8100, output_tokens: 50, tool_calls: 1 },
      })
      const state = (
        await pool.query('SELECT adapter_state FROM ai_executions')
      ).rows[0].adapter_state
      expect(state.steps).toMatchObject([
        { step: 'search', status: 'completed', responseId: 'search-id' },
        { step: 'synthesis', status: 'unknown', responseId: null },
      ])
    })

    it('shares the budget with other AI work and includes the search price before funding waiting research', async () => {
      const month = budgetMonth()
      await pool.query(
        'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,1)',
        [month],
      )
      const importId = randomUUID()
      await pool.query(
        "INSERT INTO profile_imports(id,kind,status) VALUES($1,'text','ready')",
        [importId],
      )
      await pool.query(
        "INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration) VALUES($1,$2,0,$3,1,$4,'profile','unknown',0.5,$5)",
        [randomUUID(), importId, month, randomUUID(), pricing],
      )
      const op = await requestResearch(companyId, command())
      // Tokens alone cost .416, but the .12 search price makes .536 exceed
      // the remaining .5.
      expect(await operation(op.id)).toMatchObject({
        state: 'waiting_budget',
        reserved: null,
      })
      expect(queue.executionJobs()).toHaveLength(0)
      await recoverExecutions()
      expect(queue.executionJobs()).toHaveLength(0)
      await pool.query(
        'UPDATE ai_budget_months SET limit_pln=2 WHERE month=$1',
        [month],
      )
      await recoverExecutions()
      expect(await operation(op.id)).toMatchObject({
        state: 'queued',
        reserved: '0.536000',
      })
      expect(
        await count(
          "SELECT count(*)::int AS n FROM ai_attempts WHERE operation_type='execution'",
        ),
      ).toBe(1)
      expect(queue.executionJobs()).toHaveLength(1)
    })

    it('E04-AC04: leaves running research alone with its reservation and never starts a new search, until oferty-pracy-0mq.15', async () => {
      const op = await requestResearch(companyId, command())
      const executionId = await executionOf(op.id)
      await pool.query("UPDATE ai_executions SET state='running' WHERE id=$1", [
        executionId,
      ])
      queue.reset()
      await recoverExecutions()
      await recoverExecutions()
      await execute(op.id, mockedProvider())
      expect(fetcher).not.toHaveBeenCalled()
      expect(queue.executionJobs()).toHaveLength(0)
      expect(await operation(op.id)).toMatchObject({
        state: 'running',
        costState: 'reserved',
        error: null,
        reserved: '0.536000',
      })
      expect(await count('SELECT count(*)::int AS n FROM ai_attempts')).toBe(1)
    })

    it('sends nothing more for research that ended elsewhere while it searched, and does not overwrite that end', async () => {
      const op = await requestResearch(companyId, command())
      const executionId = await executionOf(op.id)
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => {
          // The execution ended elsewhere meanwhile.
          await pool.query(
            "UPDATE ai_executions SET state='failed',cause='unknown',finished_at=now() WHERE id=$1",
            [executionId],
          )
          return Response.json(searchResponse())
        })
        .mockResolvedValueOnce(Response.json(synthesisResponse()))
      await execute(op.id, transport)
      expect(transport).toHaveBeenCalledTimes(1)
      expect(await operation(op.id)).toMatchObject({
        state: 'failed',
        report: null,
        error: null,
      })
    })

    it('refuses a new research without the research settings, before anything is saved', async () => {
      usePricing('research', null)
      await expect(
        requestResearch(companyId, command()),
      ).rejects.toBeInstanceOf(ResearchConfigurationError)
      expect(
        await count('SELECT count(*)::int AS n FROM company_research'),
      ).toBe(0)
      expect(await readCompanyResearch(companyId)).toMatchObject({
        configured: false,
        ceiling: null,
      })
      usePricing('research', pricing, 'agent')
      expect(await readCompanyResearch(companyId)).toMatchObject({
        configured: true,
        ceiling: '0.536000',
      })
    })
  },
)

function http(
  path: string,
  method = 'GET',
  body?: unknown,
  origin?: string,
): Promise<{ status?: number; cache?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(path, process.env.WEB_BASE_URL ?? 'http://web:3000'),
      {
        method,
        headers: {
          Host: 'localhost',
          'Content-Type': 'application/json',
          ...(origin ? { Origin: origin } : {}),
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('error', reject)
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            cache: res.headers['cache-control'],
            body: text,
          }),
        )
      },
    )
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')))
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
integration('company research HTTP boundary without live paid calls', () => {
  it('returns 404 for nonexistent profiles and blocks cross-origin research requests', async () => {
    const missing = `/api/companies/${randomUUID()}/research`
    expect((await http(missing)).status).toBe(404)
    expect((await http('/api/companies/not-a-uuid/research')).status).toBe(404)
    expect(
      (
        await http(
          missing,
          'POST',
          { commandId: randomUUID(), refresh: false },
          'https://untrusted.example',
        )
      ).status,
    ).toBe(403)
    expect(
      (await http(missing, 'POST', { commandId: randomUUID(), refresh: false }))
        .status,
    ).toBe(403)
    expect((await http(missing, 'POST', {}, 'http://localhost')).status).toBe(
      422,
    )
    expect(
      (
        await http(
          missing,
          'POST',
          { commandId: randomUUID(), refresh: false },
          'http://localhost',
        )
      ).status,
    ).toBe(404)
  })
})
