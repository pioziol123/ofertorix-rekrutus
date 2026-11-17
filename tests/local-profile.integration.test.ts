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
import { budgetMonth } from '../modules/ai/index.ts'
import { prepareProposal, executeAi } from '../lib/profile/ai.ts'
import {
  retryLocalProfile,
  recoverLocalProfiles,
} from '../lib/profile/local-ai.ts'
import { createTextImport } from '../lib/profile/imports.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('local profile executions in PostgreSQL', () => {
  const schema = `local_profile_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  const boss = { send: vi.fn(async () => randomUUID()) } as unknown as PgBoss
  const selection = {
    version: 1,
    provider: 'ollama',
    execution: 'direct',
    model: 'gpt-oss:20b',
    endpointRef: 'local',
    endpointVersion: 1,
    runtimeParameters: { numCtx: 8192 },
  }
  const endpoint = {
    ref: 'local',
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
  async function enqueue(input = 'PHP experience') {
    const importId = await createTextImport(pool, input)
    const prepared = await prepareProposal(
      pool,
      boss,
      importId,
      input,
      0,
      fetcher(),
    )
    if (!('executionId' in prepared) || !prepared.executionId)
      throw new Error('Expected local execution')
    return { ...prepared, importId }
  }
  const attempt = async (id: string) =>
    (await pool.query('SELECT * FROM ai_attempts WHERE id=$1', [id])).rows[0]
  const execution = async (id: string) =>
    (await pool.query('SELECT * FROM ai_executions WHERE id=$1', [id])).rows[0]
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
      '1770000000004_profiles',
      '1770000000013_local_ai',
    ])
      require(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
  })
  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('AI_PROFILE_PRICING_JSON', '')
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', JSON.stringify(selection))
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
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('runs without paid configuration or budget and uses the saved model and inputs', async () => {
    await pool.query('INSERT INTO ai_budget_months VALUES ($1,0)', [
      budgetMonth(),
    ])
    const task = await enqueue()
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', '{broken')
    const mock = fetcher()
    await executeAi(pool, boss, task.id, mock)
    expect(await attempt(task.id)).toMatchObject({
      state: 'settled',
      month: null,
      reserved_pln: '0.000000',
      actual_pln: '0.000000',
      proposal,
    })
    expect(await execution(task.executionId)).toMatchObject({
      runtime_state: 'finished',
      result_status: 'completed',
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
  it('archives an invalid result and explicit retry copies the original snapshot', async () => {
    const task = await enqueue()
    const mock = fetcher(() => result('{invalid'))
    await executeAi(pool, boss, task.id, mock)
    const old = await execution(task.executionId)
    expect(old).toMatchObject({
      runtime_state: 'finished',
      result_status: 'failed',
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
    vi.stubEnv(
      'AI_PROFILE_EXECUTION_JSON',
      JSON.stringify({ ...selection, runtimeParameters: { numCtx: 4096 } }),
    )
    const next = await retryLocalProfile(
      pool,
      boss,
      task.id,
      Number(old.revision),
    )
    expect(next.executionId).not.toBe(old.id)
    expect((await execution(next.executionId)).configuration).toEqual(
      old.configuration,
    )
    expect((await execution(old.id)).publication_allowed).toBe(false)
  })
  it('keeps the slot after uncertain HTTP and prevents another worker from generating', async () => {
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
    const running = executeAi(pool, boss, first.id, mock)
    try {
      await started
      await executeAi(pool, boss, second.id, mock)
      expect(mock).toHaveBeenCalledTimes(2)
    } finally {
      fail(new Error('Connection lost'))
      await running
    }
    await recoverLocalProfiles(pool, boss)
    await executeAi(pool, boss, second.id, mock)
    expect(mock).toHaveBeenCalledTimes(2)
    expect(await execution(first.executionId)).toMatchObject({
      runtime_state: 'unknown',
    })
    expect(
      (await pool.query('SELECT execution_id FROM ai_local_slots')).rows[0]
        ?.execution_id,
    ).toBe(first.executionId)
    expect((await attempt(second.id)).state).toBe('queued')
  })
  it('archives the superseded result without publishing it or starting the retry early', async () => {
    const task = await enqueue()
    const entered = Promise.withResolvers<undefined>()
    const reply = Promise.withResolvers<Response>()
    const mock = fetcher(() => {
      entered.resolve(undefined)
      return reply.promise
    })
    const running = executeAi(pool, boss, task.id, mock)
    await entered.promise
    let retry: Awaited<ReturnType<typeof retryLocalProfile>>
    try {
      retry = await retryLocalProfile(
        pool,
        boss,
        task.id,
        Number((await execution(task.executionId)).revision),
      )
      await executeAi(pool, boss, retry.id, mock)
      expect(mock).toHaveBeenCalledTimes(2)
    } finally {
      reply.resolve(result())
      await running
    }
    expect(
      (
        await pool.query(
          'SELECT status,proposal FROM profile_imports WHERE id=$1',
          [task.importId],
        )
      ).rows[0],
    ).toEqual({ status: 'ai_queued', proposal: null })
    expect(await attempt(task.id)).toMatchObject({ proposal })
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM ai_execution_artifacts WHERE execution_id=$1',
          [task.executionId],
        )
      ).rows[0]?.count,
    ).toBe(1)
    await executeAi(pool, boss, retry.id, fetcher())
    expect(await attempt(retry.id)).toMatchObject({
      state: 'settled',
      proposal,
    })
  })
})
