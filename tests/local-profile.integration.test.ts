import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
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
  localExecutionJob,
  readExecutionArchive,
  readLatestExecution,
  registerResultReceiver,
  runExecution,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { ollamaProvider } from '../modules/ai/infrastructure/adapters/ollama.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
import { useLocalModel, usePricing } from './ai-test-configuration.ts'
import { aiQueue } from './ai-queue.fixtures.ts'

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
  const queue = aiQueue()
  /** A worker's own client of the test's queues, to fetch jobs one by one. */
  let worker: PgBoss
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
  const fetcher = (
    response: (init?: RequestInit) => Response | Promise<Response> = () =>
      result(),
  ) =>
    vi.fn<typeof fetch>(async (url, init) =>
      String(url).endsWith('/api/tags') ? tags() : response(init),
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
    await runExecution({ executionId })
  }
  /** Fetches the next job of the local queue that may be carried out. */
  const fetchLocal = async () =>
    (await worker.fetch<{ executionId: string }>(localExecutionJob.queue))[0] ??
    null
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
  const archived = async (executionId: string) =>
    (await readExecutionArchive(executionId))!.artifacts.map((a) => ({
      kind: a.kind,
      key: a.artifact_key,
      content: a.content,
    }))
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
      '1770000000012_matching_batch_archives',
      '1770000000018_matching_ai_executions',
      '1770000000020_ai_execution_lease',
      '1770000000026_ai_without_local_slot_and_lease',
    ])
      require(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
    setPool(pool)
    await queue.start()
    worker = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queue.queueSchema,
      supervise: false,
      schedule: false,
    })
    worker.on('error', () => {})
    await worker.start()
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
    await queue.reset()
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await worker?.stop({ graceful: false })
    await queue.stop()
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
    // The request went to the queue of the local model.
    expect(
      (await queue.jobs()).map((job) => [job.name, job.executionId]),
    ).toEqual([[localExecutionJob.queue, task.executionId]])
    // The settings change after the request; the saved snapshot is used.
    usePricing('profile', null)
    useLocalModel('other', 4096)
    const mock = fetcher()
    runtime = mock
    await queue.work()
    expect(await attempt(task.executionId)).toMatchObject({
      state: 'settled',
      month: null,
      reserved_pln: '0.000000',
      actual_pln: '0.000000',
    })
    expect(await execution(task.executionId)).toMatchObject({
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
  })
  it("archives an invalid result in the execution's archive and accepts a new request of the import", async () => {
    const task = await enqueue()
    const mock = fetcher(() => result('{invalid'))
    await executeAi(task.executionId, mock)
    const old = await execution(task.executionId)
    expect(old).toMatchObject({ state: 'failed', cause: 'format' })
    expect(mock).toHaveBeenCalledTimes(2)
    expect(await archived(old.id)).toEqual([
      {
        kind: 'output',
        key: 'response',
        content: expect.stringContaining('{invalid'),
      },
    ])
    expect((await imported(task.importId)).error).toContain('format danych')
    runtime = fetcher()
    const next = await prepareProposal(task.importId, 'PHP experience', 1)
    expect(next.state).toBe('queued')
  })
  it('B6-AC02, A9-AC08: carries out two local requests one after the other in request order, and shows the uncertain message after uncertain HTTP', async () => {
    const first = await enqueue(),
      second = await enqueue('Vue experience')
    expect(await queue.executionJobs()).toEqual([
      first.executionId,
      second.executionId,
    ])
    const inputs: string[] = []
    const mock = fetcher((init) => {
      inputs.push(String(init?.body))
      if (inputs.length === 1) throw new Error('Connection lost')
      return result()
    })
    runtime = mock
    // The first request's job is taken first; while it is carried out, the
    // queue gives no other local job.
    const job = await fetchLocal()
    expect(job?.data).toEqual({ executionId: first.executionId })
    expect(await fetchLocal()).toBeNull()
    await runExecution(job!.data)
    expect((await readImport(second.importId))!.status).toBe('ai_queued')
    await worker.complete(localExecutionJob.queue, job!.id)
    // Only then the second one is taken.
    const next = await fetchLocal()
    expect(next?.data).toEqual({ executionId: second.executionId })
    await runExecution(next!.data)
    await worker.complete(localExecutionJob.queue, next!.id)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toContain('PHP experience')
    expect(inputs[1]).toContain('Vue experience')
    expect(await execution(first.executionId)).toMatchObject({
      state: 'uncertain',
      cause: 'network',
    })
    expect(await imported(first.importId)).toMatchObject({
      status: 'needs_attention',
      error: uncertain,
    })
    expect((await readLatestExecution(second.importId))!.state).toBe(
      'completed',
    )
    expect((await imported(second.importId)).status).toBe('proposal')
  })
  it("B6-AC05: an attempt that finds a local request running ends it as uncertain with the cause unknown; the returning process publishes nothing and its response is in the execution's archive", async () => {
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
      // The next attempt of the job finds the request running.
      await queue.reset()
      await runExecution({ executionId: task.executionId })
      expect(mock).toHaveBeenCalledTimes(2)
      // The end reaches the Profile through the delivery job it sent.
      expect(await queue.executionJobs()).toEqual([task.executionId])
      await queue.work()
      expect(await execution(task.executionId)).toMatchObject({
        state: 'uncertain',
        cause: 'unknown',
      })
      expect(await imported(task.importId)).toMatchObject({
        status: 'needs_attention',
        error: uncertain,
      })
    } finally {
      reply.resolve(result())
      await running
    }
    // The late response is kept in the archive, not published.
    expect(mock).toHaveBeenCalledTimes(2)
    expect(await imported(task.importId)).toMatchObject({
      status: 'needs_attention',
      proposal: null,
      error: uncertain,
    })
    expect(await execution(task.executionId)).toMatchObject({
      state: 'uncertain',
      cause: 'unknown',
      result: null,
    })
    expect(await archived(task.executionId)).toEqual([
      {
        kind: 'output',
        key: 'response',
        content: expect.stringContaining('"done":true'),
      },
    ])
  })
})
