import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  importCvText,
  prepareProposal,
  proposalReceiver,
  proposalSettingsKey,
  readImport,
} from '../modules/profile/index.ts'
import {
  readLatestExecution,
  recoverExecutions,
  registerResultReceiver,
  runExecution,
  useAiQueue,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { ollamaProvider } from '../modules/ai/infrastructure/adapters/ollama.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
import { useLocalModel, usePricing } from './ai-test-configuration.ts'

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

const uncertain =
  'Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem.'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('local profile executions in PostgreSQL', () => {
  const schema = `local_profile_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  const boss = { send: vi.fn(async () => randomUUID()) } as unknown as PgBoss
  const selection = { model: 'gpt-oss:20b' }
  const endpoint = {
    ref: 'ollama',
    version: 1,
    url: 'http://ollama.test',
    credentialEnv: null,
  }
  const proposal = { summary: null, skills: [], experience: [] }
  const tags = () =>
    Response.json({
      models: [{ name: selection.model, digest: 'fixture-digest' }],
    })
  const result = (content = JSON.stringify(proposal)) =>
    Response.json({
      done: true,
      done_reason: 'stop',
      message: { role: 'assistant', content },
    })
  const fetcher = (response: () => Response | Promise<Response> = result) =>
    vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/api/tags') ? tags() : response(),
    )
  /** The local runtime, simulated by the fetcher each step sets. */
  let runtime: typeof fetch = fetcher()
  async function enqueue(input = 'PHP experience') {
    const importId = await importCvText(input)
    runtime = fetcher()
    const prepared = await prepareProposal(importId, input, 0)
    if (!('executionId' in prepared)) throw new Error('Expected a request')
    return { ...prepared, importId }
  }
  async function executeAi(executionId: string, mock: typeof fetch) {
    runtime = mock
    await runExecution(executionId)
  }
  const attempt = async (executionId: string) =>
    (
      await pool.query('SELECT * FROM ai_attempts WHERE execution_id=$1', [
        executionId,
      ])
    ).rows[0]
  const execution = async (id: string) =>
    (await pool.query('SELECT * FROM ai_executions WHERE id=$1', [id])).rows[0]
  const imported = async (id: string) =>
    (
      await pool.query(
        'SELECT status,proposal,error FROM profile_imports WHERE id=$1',
        [id],
      )
    ).rows[0]
  const slotHolder = async () =>
    (await pool.query('SELECT execution_id FROM ai_local_slots')).rows[0]
      ?.execution_id
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const require = createRequire(import.meta.url)
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
      '1770000000018_matching_ai_executions',
      '1770000000020_ai_execution_lease',
    ])
      require(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
    setPool(pool)
    useAiQueue(boss)
    registerProviderAdapter(
      ollamaProvider((input, init) => runtime(input, init)),
    )
    registerResultReceiver(proposalSettingsKey, proposalReceiver)
  })
  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    useLocalModel('profile')
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    await pool.query(
      'TRUNCATE ai_executions, profile_imports, ai_budget_months CASCADE',
    )
    await pool.query(
      "INSERT INTO ai_local_slots(id) VALUES('local-ai') ON CONFLICT DO NOTHING",
    )
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('A9-AC01: runs without paid configuration or budget and uses the saved model and inputs', async () => {
    await pool.query('INSERT INTO ai_budget_months VALUES ($1,0)', [
      budgetMonth(),
    ])
    const task = await enqueue()
    expect(task.state).toBe('queued')
    // The settings change after the request; the saved snapshot is used.
    usePricing('profile', null)
    useLocalModel('other', 4096)
    const mock = fetcher()
    await executeAi(task.executionId, mock)
    expect(await attempt(task.executionId)).toMatchObject({
      state: 'settled',
      month: null,
      reserved_pln: '0.000000',
      actual_pln: '0.000000',
    })
    expect(await execution(task.executionId)).toMatchObject({
      runtime_state: 'finished',
      state: 'completed',
      input_version: '1',
      result: proposal,
    })
    expect(await imported(task.importId)).toEqual({
      status: 'proposal',
      proposal,
      error: null,
    })
    expect(mock.mock.calls.map(([url]) => url)).toEqual([
      'http://ollama.test/api/tags',
      'http://ollama.test/api/chat',
    ])
    expect(JSON.parse(String(mock.mock.calls[1]![1]?.body))).toMatchObject({
      model: 'gpt-oss:20b',
      options: { num_ctx: 8192 },
    })
    expect(await slotHolder()).toBeNull()
  })
  it('refuses a model whose version changed after the check, before inference', async () => {
    const task = await enqueue()
    const mock = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/api/tags')
        ? Response.json({
            models: [{ name: selection.model, digest: 'other-digest' }],
          })
        : result(),
    )
    await executeAi(task.executionId, mock)
    expect(mock).toHaveBeenCalledOnce()
    expect(await execution(task.executionId)).toMatchObject({
      state: 'failed',
      cause: 'model_unavailable',
    })
    expect(await slotHolder()).toBeNull()
  })
  it('archives an invalid result and accepts a new request of the import', async () => {
    const task = await enqueue()
    const mock = fetcher(() => result('{invalid'))
    await executeAi(task.executionId, mock)
    const old = await execution(task.executionId)
    expect(old).toMatchObject({
      runtime_state: 'finished',
      state: 'failed',
      cause: 'format',
    })
    expect(mock).toHaveBeenCalledTimes(2)
    expect(
      (
        await pool.query(
          'SELECT content FROM ai_execution_artifacts WHERE execution_id=$1',
          [old.id],
        )
      ).rows[0]?.content,
    ).toContain('{invalid')
    expect((await imported(task.importId)).error).toContain('format danych')
    runtime = fetcher()
    const next = await prepareProposal(task.importId, 'PHP experience', 1)
    expect(next.state).toBe('queued')
  })
  it('A9-AC03, A9-AC08: keeps the slot after uncertain HTTP, prevents another worker from generating and shows the uncertain message', async () => {
    const first = await enqueue(),
      second = await enqueue('Vue experience')
    let start!: () => void, fail!: (error: Error) => void
    const started = new Promise<void>((resolve) => {
      start = resolve
    })
    const response = new Promise<Response>((_resolve, reject) => {
      fail = reject
    })
    const mock = fetcher(() => {
      start()
      return response
    })
    const running = executeAi(first.executionId, mock)
    try {
      await started
      await executeAi(second.executionId, mock)
      expect(mock).toHaveBeenCalledTimes(2)
      expect((await readImport(first.importId))!.status).toBe('ai_running')
      expect((await readImport(second.importId))!.status).toBe('ai_queued')
    } finally {
      fail(new Error('Connection lost'))
      await running
    }
    await recoverExecutions()
    await executeAi(second.executionId, mock)
    expect(mock).toHaveBeenCalledTimes(2)
    expect(await execution(first.executionId)).toMatchObject({
      runtime_state: 'unknown',
      state: 'uncertain',
      cause: 'network',
    })
    expect(await slotHolder()).toBe(first.executionId)
    expect((await readLatestExecution(second.importId))!.state).toBe('queued')
    expect(await imported(first.importId)).toMatchObject({
      status: 'needs_attention',
      error: uncertain,
    })
  })
  it('A9-AC03: ends a run whose lease lapsed as uncertain, keeps the slot while the process runs and does not publish its late result', async () => {
    const task = await enqueue()
    const entered = Promise.withResolvers<undefined>()
    const reply = Promise.withResolvers<Response>()
    const mock = fetcher(() => {
      entered.resolve(undefined)
      return reply.promise
    })
    const running = executeAi(task.executionId, mock)
    await entered.promise
    try {
      await pool.query(
        "UPDATE ai_local_slots SET lease_until=now()-interval '1 second'",
      )
      await recoverExecutions()
      await runExecution(task.executionId)
      expect(await execution(task.executionId)).toMatchObject({
        runtime_state: 'unknown',
        state: 'uncertain',
        cause: 'interrupted',
      })
      expect(await imported(task.importId)).toMatchObject({
        status: 'needs_attention',
        error: uncertain,
      })
      expect(await slotHolder()).toBe(task.executionId)
    } finally {
      reply.resolve(result())
      await running
    }
    // The late response is kept in the history, not published.
    expect(await imported(task.importId)).toMatchObject({
      status: 'needs_attention',
      proposal: null,
    })
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM ai_execution_artifacts WHERE execution_id=$1',
          [task.executionId],
        )
      ).rows[0]?.count,
    ).toBe(1)
    // The execution stays uncertain; the process confirmed its end, so the
    // slot is free again, as before.
    expect(await execution(task.executionId)).toMatchObject({
      state: 'uncertain',
      runtime_state: 'finished',
    })
    expect(await slotHolder()).toBeNull()
  })
  it('A9-AC03: ends a run whose process ended after its lease lapsed as interrupted, releases the slot and does not publish the result', async () => {
    const task = await enqueue()
    const mock = fetcher(async () => {
      await pool.query(
        "UPDATE ai_local_slots SET lease_until=now()-interval '1 second'",
      )
      return result()
    })
    await executeAi(task.executionId, mock)
    expect(await execution(task.executionId)).toMatchObject({
      runtime_state: 'finished',
      state: 'failed',
      cause: 'interrupted',
      result: null,
    })
    expect(await slotHolder()).toBeNull()
    expect(await imported(task.importId)).toMatchObject({
      status: 'needs_attention',
      proposal: null,
      error:
        'Worker utracił prawo do publikacji. Odpowiedź pozostała w historii.',
    })
  })
})
