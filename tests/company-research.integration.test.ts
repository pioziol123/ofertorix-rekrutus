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
import { closePool, setPool, transaction } from '../lib/db.ts'
import {
  failAssignmentsPastTimeLimit,
  runOperation,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { openAiExecutor } from '../modules/ai/executors/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerExecutor } from '../modules/ai/executors/registry.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { citedMaterials } from '../modules/ai/executors/openai-search.ts'
import {
  createCompany,
  CompanyConflict,
  readCompanyResearch,
  requestResearch,
  researchAssignmentReceiver,
  ResearchConfigurationError,
} from '../modules/companies/index.ts'
import { researchStateLabels } from '../modules/companies/view.ts'
import { registerAssignmentReceivers } from '../receivers/index.ts'
import {
  assignmentPricing,
  draft,
  researchAssignmentMigrations,
  searchResponse,
  synthesisResponse,
} from './company-research.fixtures.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'

// The price lists AI keeps in code, replaced for the test; the settings of
// research's assignments are the application's own.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const inProgress = researchStateLabels.running
const failed = researchStateLabels.failed
const failedAssignment =
  'Nie udało się uzyskać kompletnego raportu z dowodami. Poprzedni raport pozostaje dostępny. Szczegóły są w panelu zleceń AI.'

/**
 * Company research through one agent assignment of the AI module (task
 * oferty-pracy-sq2.10, T9), with OpenAI simulated by the paid executor's
 * transport: the agent session searches and writes the report, Companies'
 * receiver validates and publishes it.
 */
const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'company research through AI assignments in isolated PostgreSQL',
  () => {
    const schema = `research_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool, pool: Pool, companyId: string
    const queue = aiQueue()
    /** The simulated transport of OpenAI; each test sets its answers. */
    let provider: typeof fetch = () => {
      throw new Error('Unexpected provider call')
    }
    const command = (refresh = false) => ({ commandId: randomUUID(), refresh })
    const answering = (...responses: unknown[]) => {
      const transport = vi.fn<typeof fetch>()
      for (const response of responses)
        transport.mockResolvedValueOnce(Response.json(response))
      return transport
    }
    const valid = () => answering(searchResponse(), synthesisResponse())
    const count = async (table: string) =>
      (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
        .n as number
    const assignmentIdOf = async (researchId: string) =>
      (
        await pool.query(
          'SELECT assignment_id FROM company_research WHERE id=$1',
          [researchId],
        )
      ).rows[0].assignment_id as string
    const assignmentOf = async (researchId: string) =>
      (
        await pool.query(
          `SELECT a.id,a.settings_name,a.type,a.label,a.instruction,a.input,
            a.response_format,a.agent_options,a.status,a.failure_reason
           FROM company_research r JOIN ai_assignments a ON a.id=r.assignment_id
           WHERE r.id=$1`,
          [researchId],
        )
      ).rows[0]
    /**
     * Carries out the pending operations of a research's assignment, as
     * the worker would, with the provider answering by the transport.
     */
    async function carryOut(researchId: string, transport: typeof fetch) {
      provider = transport
      const pending = (
        await pool.query(
          "SELECT id FROM ai_operations WHERE assignment_id=$1 AND state='pending' ORDER BY ordinal",
          [await assignmentIdOf(researchId)],
        )
      ).rows
      for (const { id } of pending) await runOperation({ operationId: id })
    }
    const operation = async (id: string) =>
      (await readCompanyResearch(companyId)).operations.find((o) => o.id === id)
    /** Companies' rows of research, for comparing data before and after. */
    const researchRows = async () =>
      (
        await pool.query(
          'SELECT id,state,result,error,finished_at,assignment_id FROM company_research ORDER BY id',
        )
      ).rows

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
      for (const migration of researchAssignmentMigrations)
        createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
          sql: (s: string) => sql.push(s),
        })
      await pool.query(sql.join('\n'))
      // The executors' queues in the test's queue schema.
      await queue.start()
      // The receivers of the shared registration.
      registerAssignmentReceivers()
    })
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-send')
      usePricing(assignmentPricing, 'agent')
      // The paid executor with the test's price list, on the provider
      // simulated by the transport each test sets.
      registerExecutor(openAiExecutor((input, init) => provider(input, init)))
      provider = () => {
        throw new Error('Unexpected provider call')
      }
      await queue.reset()
      await pool.query(
        'TRUNCATE company_research_commands,company_research,ai_operation_exchange,ai_operations,ai_assignments,ai_attempts,ai_executions,ai_budget_months,company_commands,companies CASCADE',
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
      await queue.stop()
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })

    it('T9-AC01: places one agent assignment with web search, labelled with the company name, and stores its identifier with the research', async () => {
      const research = await requestResearch(companyId, command())
      expect(research.reused).toBe(false)
      expect(await count('ai_assignments')).toBe(1)
      expect(await assignmentOf(research.id)).toMatchObject({
        settings_name: 'research',
        type: 'agent',
        label: 'Research company',
        input: JSON.stringify({
          name: 'Research company',
          kind: 'brand',
          website: 'https://company.example',
          description: 'Owner supplied',
        }),
        response_format: { name: 'company_research' },
        agent_options: {
          tools: ['web_search'],
          resultInstruction: expect.stringContaining(
            'basic company research report',
          ),
        },
        status: 'in_progress',
      })
    })

    it('T9-AC01, T9-R04: a second request for the same company while the first is in progress places nothing, also when it asks for a refresh', async () => {
      const first = await requestResearch(companyId, command())
      expect(await requestResearch(companyId, command())).toEqual({
        id: first.id,
        reused: true,
      })
      expect(await requestResearch(companyId, command(true))).toEqual({
        id: first.id,
        reused: true,
      })
      expect(await count('ai_assignments')).toBe(1)
      expect(await count('company_research')).toBe(1)
    })

    it('T9-AC01, E04-AC01: deduplicates concurrent commands and rejects a changed command payload without another assignment', async () => {
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
      expect(await count('ai_assignments')).toBe(1)
    })

    it('T9-AC02: a valid report is saved with its sources and the assignment succeeds', async () => {
      const research = await requestResearch(companyId, command())
      const transport = valid()
      await carryOut(research.id, transport)
      expect(transport).toHaveBeenCalledTimes(2)
      expect((await assignmentOf(research.id)).status).toBe('succeeded')
      const { accessedAt: _at, ...source } =
        citedMaterials(searchResponse())[0]!.sources[0]!
      expect(await operation(research.id)).toMatchObject({
        state: 'completed',
        error: null,
        report: {
          identity: draft().identity,
          claims: expect.arrayContaining([
            expect.objectContaining({
              topic: 'activity',
              kind: 'fact',
              sources: [expect.objectContaining(source)],
            }),
          ]),
        },
      })
      // The synthesis was given the target and the cited evidence.
      expect(
        JSON.parse(JSON.parse(String(transport.mock.calls[1]![1]!.body)).input),
      ).toMatchObject({
        target: { name: 'Research company' },
        evidence: [{ id: 0, text: 'Project uses PHP.' }],
      })
    })

    it.each([
      [
        'a fabricated quote',
        () => {
          const fabricated = draft()
          fabricated.claims[0]!.evidence = [
            { id: 0, quote: 'Project uses Go.' },
          ]
          return fabricated
        },
        'Nie udało się uzyskać kompletnego raportu z dowodami (validation). Poprzedni raport pozostaje dostępny.',
      ],
      [
        'only unknowns',
        () => ({
          ...draft(),
          claims: draft().claims.map((claim) => ({
            ...claim,
            kind: 'unknown' as const,
            evidence: [],
          })),
        }),
        'Raport nie zawiera żadnych ustaleń popartych źródłami. Nie uznano go za gotowy research. Poprzedni raport pozostaje dostępny. Ponowienie wymaga nowego żądania i kosztu.',
      ],
    ])(
      'T9-AC02: a report with %s gives failed research with the assignment succeeded, and keeps the previous report',
      async (_case, report, message) => {
        const original = await requestResearch(companyId, command())
        await carryOut(original.id, valid())
        const refreshed = await requestResearch(companyId, command(true))
        expect(refreshed.reused).toBe(false)
        const synthesized = synthesisResponse()
        synthesized.output[0]!.content[0]!.text = JSON.stringify(report())
        await carryOut(refreshed.id, answering(searchResponse(), synthesized))
        expect((await assignmentOf(refreshed.id)).status).toBe('succeeded')
        expect(await operation(refreshed.id)).toMatchObject({
          state: 'failed',
          report: null,
          error: message,
        })
        expect(await operation(original.id)).toMatchObject({
          state: 'completed',
          report: { claims: expect.any(Array) },
        })
        // Ended research is not in progress: the published report is
        // reused, and a refresh places a new assignment.
        expect(await requestResearch(companyId, command())).toEqual({
          id: original.id,
          reused: true,
        })
        expect((await requestResearch(companyId, command(true))).reused).toBe(
          false,
        )
      },
    )

    it('T9-AC03, sq2.10 ASM-2: shows the texts of T9-R03 for research with an assignment in each status, with no amount and no most one research reserves', async () => {
      const shown = async (id: string) => {
        const view = await readCompanyResearch(companyId)
        expect(view).not.toHaveProperty('ceiling')
        const research = view.operations.find((o) => o.id === id)!
        // No amount for research with an assignment.
        for (const field of ['reserved', 'cost', 'costState', 'ceiling'])
          expect(research).not.toHaveProperty(field)
        return researchStateLabels[research.state]
      }
      // In progress, nothing carried out yet.
      const research = await requestResearch(companyId, command())
      expect(await shown(research.id)).toBe(inProgress)
      // Needs attention: the provider refused the request.
      await carryOut(
        research.id,
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(new Response('{}', { status: 400 })),
      )
      expect((await assignmentOf(research.id)).status).toBe('needs_attention')
      expect(await shown(research.id)).toBe(inProgress)
      // Failed: the time limit ended it.
      const assignmentId = await assignmentIdOf(research.id)
      await pool.query(
        `UPDATE ai_assignments SET placed_at=now()-interval '8 days',
          deadline=now()-interval '1 day' WHERE id=$1`,
        [assignmentId],
      )
      await failAssignmentsPastTimeLimit()
      expect((await assignmentOf(research.id)).status).toBe('failed')
      expect(await shown(research.id)).toBe(failed)
      // Succeeded and published.
      const published = await requestResearch(companyId, command())
      await carryOut(published.id, valid())
      expect((await assignmentOf(published.id)).status).toBe('succeeded')
      expect(await shown(published.id)).toBe(researchStateLabels.completed)
      // Succeeded with a report that failed Companies' check.
      const rejected = await requestResearch(companyId, command(true))
      const synthesized = synthesisResponse()
      synthesized.output[0]!.content[0]!.text = JSON.stringify({
        ...draft(),
        claims: [],
      })
      await carryOut(rejected.id, answering(searchResponse(), synthesized))
      expect((await assignmentOf(rejected.id)).status).toBe('succeeded')
      expect(await shown(rejected.id)).toBe(failed)
    })

    it('T9-AC07: after a failure reaches the receiver the research shows as failed, and new research of the same company can be requested', async () => {
      const research = await requestResearch(companyId, command())
      await pool.query(
        `UPDATE ai_assignments SET placed_at=now()-interval '8 days',
          deadline=now()-interval '1 day' WHERE id=$1`,
        [await assignmentIdOf(research.id)],
      )
      await failAssignmentsPastTimeLimit()
      expect(await assignmentOf(research.id)).toMatchObject({
        status: 'failed',
        failure_reason: 'time_limit',
      })
      expect(await operation(research.id)).toMatchObject({
        state: 'failed',
        report: null,
        error: failedAssignment,
      })
      const again = await requestResearch(companyId, command())
      expect(again.reused).toBe(false)
      expect(await count('ai_assignments')).toBe(2)
      expect(await operation(again.id)).toMatchObject({ state: 'running' })
    })

    it('T9-AC08: the receiver called twice with the same result and twice with the same failure leaves the same data as after one call', async () => {
      const materials = citedMaterials(searchResponse())
      const succeeded = await requestResearch(companyId, command())
      const result = {
        assignmentId: await assignmentIdOf(succeeded.id),
        result: draft(),
        materials,
      }
      await transaction(() => researchAssignmentReceiver.receiveResult(result))
      const once = await researchRows()
      expect(once[0]).toMatchObject({ result: { claims: expect.any(Array) } })
      await transaction(() => researchAssignmentReceiver.receiveResult(result))
      expect(await researchRows()).toEqual(once)

      const ended = await requestResearch(companyId, command(true))
      const failure = { assignmentId: await assignmentIdOf(ended.id) }
      await transaction(() =>
        researchAssignmentReceiver.receiveFailure(failure),
      )
      const afterFailure = await researchRows()
      expect(afterFailure.find((r) => r.id === ended.id)).toMatchObject({
        result: null,
        error: failedAssignment,
      })
      await transaction(() =>
        researchAssignmentReceiver.receiveFailure(failure),
      )
      expect(await researchRows()).toEqual(afterFailure)
      // A result after the failure, and a failure after the result, change
      // nothing either.
      await transaction(() =>
        researchAssignmentReceiver.receiveResult({
          ...failure,
          result: draft(),
          materials,
        }),
      )
      await transaction(() =>
        researchAssignmentReceiver.receiveFailure({
          assignmentId: result.assignmentId,
        }),
      )
      expect(await researchRows()).toEqual(afterFailure)
    })

    it('T9-AC04: reuses the published report without current configuration', async () => {
      const research = await requestResearch(companyId, command())
      await carryOut(research.id, valid())
      vi.stubEnv('OPENAI_API_KEY', '')
      expect(await requestResearch(companyId, command())).toEqual({
        id: research.id,
        reused: true,
      })
      expect(await count('ai_assignments')).toBe(1)
    })

    it('T9-AC04, E04-AC01: keeps both published versions after a successful explicit refresh', async () => {
      const first = await requestResearch(companyId, command())
      await carryOut(first.id, valid())
      await pool.query(
        "UPDATE companies SET name='Changed owner name' WHERE id=$1",
        [companyId],
      )
      const second = await requestResearch(companyId, command(true))
      const transport = valid()
      await carryOut(second.id, transport)
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
      expect((await assignmentOf(second.id)).label).toBe('Changed owner name')
      expect(JSON.parse(String(transport.mock.calls[0]![1]!.body)).input).toBe(
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
      expect(await count('ai_assignments')).toBe(2)
    })

    it('refuses a new research without the configuration of its executor, before anything is saved', async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      await expect(
        requestResearch(companyId, command()),
      ).rejects.toBeInstanceOf(ResearchConfigurationError)
      expect(await count('company_research')).toBe(0)
      expect(await count('ai_assignments')).toBe(0)
      expect(await readCompanyResearch(companyId)).toEqual({
        configured: false,
        operations: [],
      })
      vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-send')
      expect((await readCompanyResearch(companyId)).configured).toBe(true)
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
