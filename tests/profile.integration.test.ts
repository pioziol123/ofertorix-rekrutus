import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  applyProposal,
  emptyProfile,
  emptySkill,
} from '../modules/profile/domain/profile-data.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { digest } from '../modules/profile/domain/cv-document.ts'
import {
  confirmProfile,
  importCvDocument,
  importCvText,
  prepareProposal,
  proposalReceiver,
  proposalSettingsKey,
  readCvText,
  readImport,
  readOriginalFile,
  readProfile,
  saveDraft,
} from '../modules/profile/index.ts'
import { closePool, setPool } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import { prepareCvTextQueue } from './profile.fixtures.ts'
import {
  aiExecutionJobOptions,
  aiExecutionQueue,
  readExecutionArchive,
  readLatestExecution,
  recoverExecutions,
  registerResultReceiver,
  runExecution,
  useAiQueue,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { openAiProvider } from '../modules/ai/infrastructure/adapters/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
import { usePricing } from './ai-test-configuration.ts'

// The settings and price lists AI keeps in code, replaced for the test.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'profiles in isolated PostgreSQL and private document storage',
  () => {
    const suffix = randomUUID().replaceAll('-', ''),
      schema = `profile_test_${suffix}`,
      queueSchema = `profile_queue_${suffix}`
    let admin: Pool, pool: Pool, boss: PgBoss, root: string
    const pricing = {
      model: 'test-only',
      version: 'test',
      inputUsdPerMillion: '1',
      outputUsdPerMillion: '1',
      usdPln: '1',
      fxVersion: 'test',
      maxInputTokens: 1000,
      maxOutputTokens: 500,
    }
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
        max: 10,
      })
      const sql: string[] = []
      for (const migration of [
        '1770000000001_sources',
        '1770000000004_profiles',
        '1770000000006_matching',
        '1770000000013_local_ai',
        '1770000000016_ai_execution_requests',
        '1770000000017_profile_ai_executions',
        '1770000000007_matching_payload',
        '1770000000008_matching_groups',
        '1770000000012_matching_batch_archives',
        '1770000000018_matching_ai_executions',
        '1770000000020_ai_execution_lease',
      ])
        createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
          sql: (s: string) => sql.push(s),
        })
      await pool.query(sql.join('\n'))
      setPool(pool)
      boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        schema: queueSchema,
      })
      boss.on('error', () => {})
      await boss.start()
      await prepareCvTextQueue(queueSchema)
      process.env.PG_BOSS_SCHEMA = queueSchema
      await boss.createQueue(aiExecutionQueue, aiExecutionJobOptions)
      useAiQueue(boss)
      // The paid provider, simulated by the fetcher each test sets.
      registerProviderAdapter(
        openAiProvider((input, init) => provider(input, init)),
      )
      registerResultReceiver(proposalSettingsKey, proposalReceiver)
      root = await mkdtemp(join(tmpdir(), 'profile-tests-'))
    }, 30000)
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'test-key-never-send')
      usePricing('profile', pricing)
      await pool.query(
        'TRUNCATE profile_import_texts,ai_attempts,ai_executions,ai_budget_months,profile_imports,profile_drafts,profile_head,profile_versions CASCADE',
      )
      await pool.query('INSERT INTO profile_head(singleton) VALUES(true)')
    })
    afterAll(async () => {
      vi.unstubAllEnvs()
      await boss?.stop()
      await stopQueues()
      delete process.env.PG_BOSS_SCHEMA
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
        await admin.end()
      }
      if (root) await rm(root, { recursive: true, force: true })
    })
    const fixture = (name: string) =>
      readFile(new URL(`./fixtures/profile/${name}`, import.meta.url))
    let provider: typeof fetch = () => {
      throw new Error('Unexpected provider call')
    }
    /** Runs the AI job of an execution with the simulated provider. */
    async function executeAi(executionId: string, fetcher: typeof fetch) {
      provider = fetcher
      await runExecution(executionId)
    }
    async function readyAttempt(text = 'PHP professional') {
      const id = await importCvText(text)
      const result = await prepareProposal(id, text, 0)
      if (!('executionId' in result)) throw new Error('Expected a request')
      return { id, executionId: result.executionId }
    }
    const attemptOf = async (executionId: string) =>
      (
        await pool.query('SELECT * FROM ai_attempts WHERE execution_id=$1', [
          executionId,
        ])
      ).rows[0]
    const importOf = async (id: string) =>
      (
        await pool.query(
          'SELECT status,proposal,error,text_revision FROM profile_imports WHERE id=$1',
          [id],
        )
      ).rows[0]
    const response = (
      facts: unknown,
      usage: unknown = { input_tokens: 100, output_tokens: 50 },
    ) =>
      new Response(
        JSON.stringify({
          id: 'synthetic-response',
          status: 'completed',
          usage,
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(facts) }],
            },
          ],
        }),
        { status: 200 },
      )
    it('separates draft from active version, detects stale saves and confirms idempotently', async () => {
      expect((await readProfile()).active).toBeNull()
      const data = emptyProfile()
      data.summary = 'First'
      const draft = await saveDraft(data, 0)
      expect((await readProfile()).active).toBeNull()
      await expect(saveDraft(data, 0)).rejects.toThrow('Draft changed')
      const command = randomUUID(),
        version = await confirmProfile(draft.revision, null, command)
      expect((await confirmProfile(draft.revision, null, command)).id).toBe(
        version.id,
      )
      expect((await readProfile()).versions).toHaveLength(1)
      await expect(
        confirmProfile(draft.revision, null, randomUUID()),
      ).rejects.toThrow('Profile changed')
      const state = await readProfile()
      data.summary = 'Second draft'
      await saveDraft(data, state.draft.revision)
      expect((await readProfile()).active.data.summary).toBe('First')
    })
    it('allows only one concurrent draft writer and validates import references', async () => {
      const results = await Promise.allSettled([
        saveDraft(emptyProfile(), 0),
        saveDraft(emptyProfile(), 0),
      ])
      expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1)
      const data = emptyProfile()
      data.sources = [randomUUID()]
      await expect(saveDraft(data, 1)).rejects.toThrow(
        'Invalid import references',
      )
      const id = await importCvText('PHP')
      data.sources = [id]
      expect((await saveDraft(data, 1)).data.sources).toEqual([id])
    })
    it('validates every provenance against immutable reviewed text and listed imports', async () => {
      const id = await importCvText('PHP experience')
      await pool.query(
        'INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,1,$2)',
        [id, 'PHP experience'],
      )
      const data = emptyProfile()
      data.skills = [
        {
          ...emptySkill(),
          name: 'PHP',
          source: { importId: id, textRevision: 1, evidence: 'PHP' },
        },
      ]
      await expect(saveDraft(data, 0)).rejects.toThrow('Missing provenance')
      data.sources = [id]
      data.skills[0]!.source!.textRevision = 2
      await expect(saveDraft(data, 0)).rejects.toThrow('Invalid provenance')
      data.skills[0]!.source!.textRevision = 1
      data.skills[0]!.source!.evidence = 'Vue'
      await expect(saveDraft(data, 0)).rejects.toThrow('Invalid provenance')
      data.skills[0]!.source!.evidence = 'PHP'
      expect((await saveDraft(data, 0)).data.skills[0].source).toEqual(
        data.skills[0]!.source,
      )
    })
    it('rejects command reuse with different confirmation arguments', async () => {
      const draft = await saveDraft(emptyProfile(), 0),
        command = randomUUID()
      const version = await confirmProfile(draft.revision, null, command)
      await expect(
        confirmProfile(draft.revision + 1, null, command),
      ).rejects.toThrow('Command already used')
      await expect(
        confirmProfile(draft.revision, version.id, command),
      ).rejects.toThrow('Command already used')
    })
    it('stores repeated originals independently and checks hashes', async () => {
      const bytes = await fixture('text.pdf'),
        first = await importCvDocument('../CV.pdf', bytes, root),
        second = await importCvDocument('../CV.pdf', bytes, root)
      expect(first).not.toBe(second)
      expect((await readOriginalFile(first, root))?.bytes).toEqual(bytes)
      const rows = (
        await pool.query('SELECT * FROM profile_imports ORDER BY created_at')
      ).rows
      expect(rows[0].sha256).toBe(digest(bytes))
      expect(rows[0].path_key).not.toBe(rows[1].path_key)
      expect(rows[0].original_name).not.toContain('/')
      await writeFile(join(root, rows[0].path_key), 'changed')
      await expect(readOriginalFile(first, root)).rejects.toThrow(
        'hash mismatch',
      )
    })
    it.each(['text.pdf', 'text.docx'])(
      'extracts synthetic %s locally and retains original',
      async (name) => {
        const bytes = await fixture(name),
          id = await importCvDocument(name, bytes, root)
        await readCvText({ importId: id }, root)
        const row = (
          await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
        ).rows[0]
        expect(row.status).toBe('ready')
        expect(row.source_text).toMatch(/PHP/i)
        expect((await readOriginalFile(id, root))?.bytes).toEqual(bytes)
      },
      30000,
    )
    it.each(['scan.pdf', 'corrupt.docx'])(
      'falls back to manual text for %s without losing original',
      async (name) => {
        const bytes =
            name === 'scan.pdf'
              ? await fixture(name)
              : Buffer.from([80, 75, 3, 4, 1, 2, 3]),
          id = await importCvDocument(name, bytes, root)
        await readCvText({ importId: id }, root)
        expect(
          (
            await pool.query('SELECT status FROM profile_imports WHERE id=$1', [
              id,
            ])
          ).rows[0].status,
        ).toBe('needs_text')
        expect((await readOriginalFile(id, root))?.bytes).toEqual(bytes)
      },
      30000,
    )
    it('does not enqueue paid requests without configuration and keeps reviewed text revisions', async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      const id = await importCvText('PHP mail@example.com')
      expect(await prepareProposal(id, 'PHP mail@example.com', 0)).toEqual({
        state: 'needs_configuration',
      })
      expect((await pool.query('SELECT * FROM ai_attempts')).rowCount).toBe(0)
      expect((await pool.query('SELECT * FROM ai_executions')).rowCount).toBe(0)
      const row = (
        await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
      ).rows[0]
      expect(row.professional_text).not.toContain('mail@example.com')
      expect(row.source_text).toContain('mail@example.com')
      await expect(prepareProposal(id, 'PHP', 0)).rejects.toThrow(
        'text changed',
      )
    })
    it('reserves the monthly 100 PLN cap atomically for concurrent imports', async () => {
      usePricing('profile', {
        ...pricing,
        inputUsdPerMillion: '60000',
        maxInputTokens: 1000,
        maxOutputTokens: 1,
      })
      const ids = await Promise.all([importCvText('PHP'), importCvText('PHP')])
      const result = await Promise.all(
        ids.map((id) => prepareProposal(id, 'PHP', 0)),
      )
      expect(result.map((v) => v.state).sort()).toEqual([
        'queued',
        'waiting_budget',
      ])
      const sum = (
        await pool.query(
          "SELECT sum(reserved_pln)::text total FROM ai_attempts WHERE state='open'",
        )
      ).rows[0].total
      expect(Number(sum)).toBeLessThanOrEqual(100)
      const statuses = await Promise.all(
        ids.map(async (id) => (await readImport(id))!.status),
      )
      expect(statuses.sort()).toEqual(['ai_queued', 'waiting_budget'])
      // A9-R05: at most one proposal preparation per import is in progress.
      for (const id of ids)
        await expect(prepareProposal(id, 'PHP', 1)).rejects.toThrow(
          'already pending',
        )
    })
    it('A9-AC01: settles known usage, saves the proposal for the right revision, rejects unsupported evidence, and never activates profile automatically', async () => {
      const { id, executionId } = await readyAttempt()
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        response({
          summary: null,
          skills: [{ name: 'PHP', description: '', evidence: 'PHP' }],
          experience: [],
        }),
      )
      await executeAi(executionId, fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body))
      expect(body).toMatchObject({
        model: 'test-only',
        store: false,
        tools: [],
        service_tier: 'default',
        max_output_tokens: 500,
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'PHP professional' }],
          },
        ],
        text: { format: { type: 'json_schema', name: 'profile_proposal' } },
      })
      const row = await attemptOf(executionId)
      expect(row.state).toBe('settled')
      expect(Number(row.actual_pln)).toBe(0.00015)
      expect(await importOf(id)).toMatchObject({
        status: 'proposal',
        text_revision: 1,
        error: null,
        proposal: { skills: [{ name: 'PHP', evidence: 'PHP' }] },
      })
      expect(await readLatestExecution(id)).toMatchObject({
        state: 'completed',
        inputVersion: '1',
      })
      expect((await readProfile()).active).toBeNull()
      // E02-AC04: a job delivered again has no further effect.
      await executeAi(executionId, fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect((await attemptOf(executionId)).actual_pln).toBe(row.actual_pln)
      const other = await readyAttempt()
      await executeAi(
        other.executionId,
        vi.fn<typeof fetch>().mockResolvedValue(
          response({
            summary: null,
            skills: [{ name: 'Vue', description: '', evidence: 'invented' }],
            experience: [],
          }),
        ),
      )
      // A9-AC02: an unconfirmed quote is rejected; the cost is settled.
      expect(await importOf(other.id)).toMatchObject({
        status: 'needs_attention',
        proposal: null,
        error:
          'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.',
      })
      expect(await readLatestExecution(other.id)).toMatchObject({
        state: 'rejected',
        rejectionReason: 'unconfirmed_quote',
        cost: { actual: '0.000150' },
      })
    })
    it('accepts flattened PDF citations, settles usage, and saves selected facts with exact source provenance', async () => {
      const text = 'PHP\n\tbackend\r\nSenior Developer   Acme',
        { id, executionId } = await readyAttempt(text),
        fetcher = vi.fn<typeof fetch>().mockResolvedValue(
          response({
            summary: null,
            skills: [
              { name: 'PHP', description: 'Backend', evidence: 'PHP backend' },
            ],
            experience: [
              {
                role: 'Senior Developer',
                company: 'Acme',
                start: null,
                end: null,
                ongoing: false,
                description: '',
                technologies: ['PHP'],
                evidence: 'Senior Developer Acme',
              },
            ],
          }),
        )
      await executeAi(executionId, fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      const attempt = await attemptOf(executionId),
        imported = await importOf(id)
      expect(attempt.state).toBe('settled')
      expect(Number(attempt.actual_pln)).toBe(0.00015)
      expect(imported.status).toBe('proposal')
      expect(imported.proposal.skills[0].evidence).toBe('PHP\n\tbackend')
      expect(imported.proposal.experience[0].evidence).toBe(
        'Senior Developer   Acme',
      )
      const selected = applyProposal(
          emptyProfile(),
          imported.proposal,
          { skills: [0], experience: [0], summary: false },
          id,
          imported.text_revision,
        ),
        saved = await saveDraft(selected, 0)
      expect(saved.data.skills[0]!.source!.evidence).toBe('PHP\n\tbackend')
      expect(saved.data.experience[0]!.source!.evidence).toBe(
        'Senior Developer   Acme',
      )
      expect((await readProfile()).active).toBeNull()
    })
    it.each([
      [{ status: 'incomplete', output: [] }, 'nie ukończyło'],
      [
        {
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'refusal', text: 'PRIVATE_SENTINEL' }],
            },
          ],
        },
        'odmówiło',
      ],
      [{ status: 'completed', output: [] }, 'jednej kompletnej'],
      [
        {
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'PRIVATE_SENTINEL' }],
            },
          ],
        },
        'format danych',
      ],
      [
        {
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    summary: null,
                    skills: [
                      {
                        name: 'PHP',
                        description: '',
                        evidence: 'PRIVATE_SENTINEL',
                      },
                    ],
                    experience: [],
                  }),
                },
              ],
            },
          ],
        },
        'potwierdzić cytatów',
      ],
    ])(
      'E02-AC03: settles valid usage even when the proposal is rejected with a safe explanation',
      async (payload, message) => {
        const { id, executionId } = await readyAttempt(),
          fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(
              JSON.stringify({
                ...payload,
                usage: { input_tokens: 100, output_tokens: 50 },
              }),
              { status: 200 },
            ),
          )
        await executeAi(executionId, fetcher)
        const attempt = await attemptOf(executionId),
          imported = await importOf(id)
        expect(attempt.state).toBe('settled')
        expect(Number(attempt.actual_pln)).toBe(0.00015)
        expect(imported).toMatchObject({
          status: 'needs_attention',
          proposal: null,
        })
        expect(imported.error).toContain(message)
        expect(imported.error).not.toContain('PRIVATE_SENTINEL')
        expect(fetcher).toHaveBeenCalledTimes(1)
      },
    )
    it('E02-AC04: keeps an unknown charge reserved and caps transient retries at two attempts', async () => {
      const { id, executionId } = await readyAttempt(),
        fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 503 }))
      await executeAi(executionId, fetcher)
      let attempts = (
        await pool.query('SELECT * FROM ai_attempts ORDER BY attempt')
      ).rows
      expect(attempts).toHaveLength(2)
      expect(attempts[0].state).toBe('unknown')
      expect(attempts[0].actual_pln).toBeNull()
      expect(Number(attempts[0].reserved_pln)).toBeGreaterThan(0)
      expect((await readImport(id))!.status).toBe('ai_queued')
      await executeAi(attempts[1].execution_id, fetcher)
      attempts = (
        await pool.query('SELECT * FROM ai_attempts ORDER BY attempt')
      ).rows
      expect(attempts).toHaveLength(2)
      expect(attempts.every((v) => v.state === 'unknown')).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(2)
      // An HTTP error without usage: AI cannot tell how the work ended.
      expect(await importOf(id)).toMatchObject({
        status: 'needs_attention',
        error:
          'Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem.',
      })
    }, 10000)
    it('E02-AC04: does not retry a refused key or a wait beyond 60 seconds', async () => {
      for (const answer of [
        new Response('', { status: 401 }),
        new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
      ]) {
        const { executionId } = await readyAttempt()
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(answer)
        await executeAi(executionId, fetcher)
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(
          (await pool.query('SELECT count(*)::int n FROM ai_attempts')).rows[0]
            .n,
        ).toBe(1)
        await pool.query('TRUNCATE ai_attempts,ai_executions CASCADE')
      }
    })
    it('rolls back paid reservation and reviewed text when queue submission fails', async () => {
      const id = await importCvText('PHP')
      const fail = vi
        .spyOn(boss, 'send')
        .mockRejectedValueOnce(new Error('queue failure'))
      try {
        await expect(prepareProposal(id, 'PHP', 0)).rejects.toThrow(
          'queue failure',
        )
      } finally {
        fail.mockRestore()
      }
      expect((await pool.query('SELECT * FROM ai_attempts')).rowCount).toBe(0)
      expect(
        (await pool.query('SELECT * FROM ai_budget_months')).rowCount,
      ).toBe(0)
      expect(
        (await pool.query('SELECT * FROM profile_import_texts')).rowCount,
      ).toBe(0)
      expect(
        (
          await pool.query(
            'SELECT text_revision,status FROM profile_imports WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual({ text_revision: 0, status: 'ready' })
    })
    it('does not reserve or accept a paid operation if queue submission returns null', async () => {
      const id = await importCvText('PHP'),
        fail = vi.spyOn(boss, 'send').mockResolvedValueOnce(null)
      try {
        await expect(prepareProposal(id, 'PHP', 0)).rejects.toThrow()
      } finally {
        fail.mockRestore()
      }
      expect((await pool.query('SELECT * FROM ai_attempts')).rowCount).toBe(0)
      expect(
        (
          await pool.query(
            'SELECT text_revision FROM profile_imports WHERE id=$1',
            [id],
          )
        ).rows[0].text_revision,
      ).toBe(0)
    })
    it('A9-AC03: prevents recovery and duplicate delivery from interrupting an active AI request', async () => {
      const { id, executionId } = await readyAttempt()
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>((resolve) => {
          release = resolve
        }),
        started = new Promise<void>((resolve) => {
          entered = resolve
        })
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
        entered()
        await gate
        return response({ summary: null, skills: [], experience: [] })
      })
      const execution = executeAi(executionId, fetcher)
      await started
      try {
        await recoverExecutions()
        const duplicate = vi.fn<typeof fetch>()
        await executeAi(executionId, duplicate)
        expect(duplicate).not.toHaveBeenCalled()
        expect((await readLatestExecution(id))!.state).toBe('running')
        expect((await readImport(id))!.status).toBe('ai_running')
      } finally {
        release()
        await execution
      }
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect((await importOf(id)).status).toBe('proposal')
    })
    it('A9-AC03: recovery queues a request that waited for budget once funds appear', async () => {
      await pool.query('INSERT INTO ai_budget_months VALUES ($1,0)', [
        budgetMonth(),
      ])
      const id = await importCvText('PHP')
      const prepared = await prepareProposal(id, 'PHP', 0)
      expect(prepared.state).toBe('waiting_budget')
      expect((await readImport(id))!.status).toBe('waiting_budget')
      await recoverExecutions()
      expect((await readImport(id))!.status).toBe('waiting_budget')
      await pool.query('UPDATE ai_budget_months SET limit_pln=100')
      await recoverExecutions()
      expect((await readImport(id))!.status).toBe('ai_queued')
    })
    it.each([
      null,
      { input_tokens: -1, output_tokens: 3 },
      { input_tokens: 1001, output_tokens: 1 },
    ])('keeps missing or out-of-bounds usage reserved: %s', async (usage) => {
      const { id, executionId } = await readyAttempt()
      await executeAi(
        executionId,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            response({ summary: null, skills: [], experience: [] }, usage),
          ),
      )
      const row = await attemptOf(executionId)
      expect(row.state).toBe('unknown')
      expect(row.actual_pln).toBeNull()
      expect(Number(row.reserved_pln)).toBeGreaterThan(0)
      // A valid proposal is saved even though its cost is not confirmed.
      expect((await importOf(id)).status).toBe('proposal')
    })
    it('A9-AC02: ignores a result for an older text revision and keeps the newer proposal', async () => {
      const { id, executionId } = await readyAttempt()
      await pool.query(
        'UPDATE profile_imports SET text_revision=2,status=$2,proposal=$3 WHERE id=$1',
        [id, 'proposal', { summary: 'newer', skills: [], experience: [] }],
      )
      await executeAi(
        executionId,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            response({ summary: 'old', skills: [], experience: [] }),
          ),
      )
      expect(await importOf(id)).toMatchObject({
        status: 'proposal',
        proposal: { summary: 'newer' },
      })
      expect(await readLatestExecution(id)).toMatchObject({
        state: 'rejected',
        rejectionReason: 'stale_revision',
        cost: { actual: '0.000150' },
      })
    })
    it('A9-AC03, A15-AC08: ends a paid request running without a lease as interrupted, with the uncertain message and its cost reserved', async () => {
      const { id, executionId } = await readyAttempt()
      // Running as before leases existed: no sign of life.
      await pool.query("UPDATE ai_executions SET state='running' WHERE id=$1", [
        executionId,
      ])
      await recoverExecutions()
      await executeAi(executionId, vi.fn<typeof fetch>())
      expect(await readLatestExecution(id)).toMatchObject({
        state: 'uncertain',
        cause: 'interrupted',
        cost: { actual: null },
      })
      expect(await attemptOf(executionId)).toMatchObject({
        state: 'unknown',
        actual_pln: null,
      })
      expect(
        Number((await attemptOf(executionId)).reserved_pln),
      ).toBeGreaterThan(0)
      expect(await importOf(id)).toMatchObject({
        status: 'needs_attention',
        proposal: null,
        error:
          'Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem.',
      })
    })
    it('A15-AC04: a worker returning after its proposal preparation ended as interrupted publishes nothing and keeps its raw response in the archive', async () => {
      const { id, executionId } = await readyAttempt()
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve)),
        started = new Promise<void>((resolve) => (entered = resolve))
      const proposal = { summary: 'late', skills: [], experience: [] }
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
        entered()
        await gate
        return response(proposal)
      })
      const lost = executeAi(executionId, fetcher)
      await started
      await pool.query(
        "UPDATE ai_executions SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
        [executionId],
      )
      await recoverExecutions()
      await runExecution(executionId)
      const ended = await importOf(id)
      expect(ended).toMatchObject({ status: 'needs_attention', proposal: null })
      release()
      await lost
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(await importOf(id)).toEqual(ended)
      expect(await readLatestExecution(id)).toMatchObject({
        state: 'uncertain',
        cause: 'interrupted',
        result: null,
        cost: { actual: null },
      })
      const archive = await readExecutionArchive(executionId)
      expect(archive!.artifacts.map((a) => [a.kind, a.artifact_key])).toEqual([
        ['output', 'response'],
      ])
      expect(JSON.parse(archive!.artifacts[0]!.content)).toMatchObject({
        id: 'synthetic-response',
      })
    })
  },
)
