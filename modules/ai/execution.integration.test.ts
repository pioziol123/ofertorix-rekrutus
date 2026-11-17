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
import { closePool, db, setPool, transaction } from '../../lib/db.ts'
import {
  AiRequestError,
  aiExecutionJobOptions,
  aiExecutionQueue,
  budgetMonth,
  ModelError,
  readBudget,
  readExecution,
  readExecutionHistory,
  recoverExecutions,
  registerProviderAdapter,
  registerResultReceiver,
  requestExecution,
  requestExecutionGroup,
  runExecution,
  useAiQueue,
  type ExecutionFailureDelivery,
  type ExecutionRequest,
  type ExecutionResultDelivery,
  type ModelResult,
  type ModelUsage,
  type ReceiverDecision,
} from './index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

// Ceiling: (1000 * 1 + 500 * 2) / 1e6 USD * 4 = 0.008 PLN per attempt.
const pricing = {
  model: 'simulated-model',
  version: 'prices-1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '2',
  usdPln: '4',
  fxVersion: 'fx-1',
  maxInputTokens: 1000,
  maxOutputTokens: 500,
}
const ceiling = '0.008000'

integration('AI execution coordination with a real database and queue', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `ai_exec_${suffix}`
  const queueSchema = `ai_exec_queue_${suffix}`
  let admin: Pool
  let pool: Pool
  let boss: PgBoss

  /** What the simulated provider answers next; one entry per call. */
  let answers: Array<() => Promise<ModelResult>>
  let calls: Array<{ model: string; instructions: string; input: string }>
  let decide: (delivery: ExecutionResultDelivery) => Promise<ReceiverDecision>
  let results: ExecutionResultDelivery[]
  let failures: ExecutionFailureDelivery[]

  const completed =
    (result: unknown, usage = { inputTokens: 100, outputTokens: 50 }) =>
    async (): Promise<ModelResult> => ({
      outcome: 'completed',
      text: JSON.stringify(result),
      usage,
      responseId: 'response-1',
    })

  const request = (
    overrides: Partial<ExecutionRequest> = {},
  ): ExecutionRequest => ({
    jobType: 'profile',
    operationId: randomUUID(),
    inputVersion: '3',
    mode: { kind: 'single' },
    instruction: 'Summarise the text.',
    responseSchema: {
      name: 'summary',
      schema: { type: 'object', properties: { text: { type: 'string' } } },
    },
    input: 'Some text',
    ...overrides,
  })

  const jobs = async () =>
    (
      await admin.query(
        `SELECT data->>'executionId' AS id FROM ${queueSchema}.job WHERE name=$1 AND state='created' ORDER BY created_on`,
        [aiExecutionQueue],
      )
    ).rows.map((r) => r.id as string)

  /** Takes the next job from the queue and handles it like the worker. */
  async function work() {
    const [job] = await boss.fetch<{ executionId: string }>(aiExecutionQueue)
    if (!job) throw new Error('Expected a queued AI job')
    await runExecution(job.data.executionId)
    await boss.complete(aiExecutionQueue, job.id)
    return job.data.executionId
  }

  const clientRows = async () =>
    (await pool.query('SELECT * FROM client_publications ORDER BY created_at'))
      .rows

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 8,
    })
    const sql: string[] = []
    for (const migration of [
      '1770000000001_sources',
      '1770000000004_profiles',
      '1770000000006_matching',
      '1770000000013_local_ai',
      '1770000000016_ai_execution_requests',
    ])
      createRequire(import.meta.url)(`../../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
    // A client's own data, written by its receiver.
    await pool.query(
      'CREATE TABLE client_publications(operation_id uuid PRIMARY KEY, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp())',
    )
    setPool(pool)
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
    })
    boss.on('error', () => {})
    await boss.start()
    await boss.createQueue(aiExecutionQueue, aiExecutionJobOptions)
    useAiQueue(boss)
    registerProviderAdapter({
      provider: 'openai',
      single: () => ({
        async generate(modelRequest) {
          calls.push(modelRequest)
          const answer = answers.shift()
          if (!answer) throw new Error('Unexpected provider call')
          return answer()
        },
      }),
    })
    registerResultReceiver('profile', {
      async receiveResult(delivery) {
        results.push(delivery)
        await db().query(
          'INSERT INTO client_publications(operation_id,content) VALUES($1,$2)',
          [delivery.operationId, JSON.stringify(delivery.result)],
        )
        return decide(delivery)
      },
      async receiveFailure(delivery) {
        failures.push(delivery)
      },
    })
  }, 30_000)

  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('AI_PROFILE_PRICING_JSON', JSON.stringify(pricing))
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', undefined)
    answers = []
    calls = []
    results = []
    failures = []
    decide = async () => ({ accepted: true })
    await pool.query(
      'TRUNCATE client_publications, ai_attempts, ai_executions, ai_budget_months CASCADE',
    )
    await admin.query(`DELETE FROM ${queueSchema}.job WHERE name=$1`, [
      aiExecutionQueue,
    ])
  })

  afterEach(() => vi.unstubAllEnvs())

  afterAll(async () => {
    await boss?.stop()
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })

  it('A14-AC02: runs a request through the queue and exposes state, result, usage and cost; the result reaches the receiver', async () => {
    const requested = request()
    const admitted = await requestExecution(requested)
    expect(admitted.state).toBe('queued')
    expect(await jobs()).toEqual([admitted.executionId])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'queued',
      operationId: requested.operationId,
      inputVersion: '3',
      cost: { reserved: ceiling, actual: null, unknown: false },
    })
    expect((await readBudget()).reserved).toBe(ceiling)

    answers.push(completed({ text: 'summary' }))
    expect(await work()).toBe(admitted.executionId)

    expect(calls).toEqual([
      {
        model: 'simulated-model',
        instructions: 'Summarise the text.',
        input: 'Some text',
        output: requested.responseSchema,
      },
    ])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'completed',
      result: { text: 'summary' },
      usage: { inputTokens: 100, outputTokens: 50 },
      // (100 * 1 + 50 * 2) / 1e6 USD * 4 PLN
      cost: { reserved: ceiling, actual: '0.000800', unknown: false },
      cause: null,
      attempt: 1,
    })
    expect(results).toEqual([
      {
        executionId: admitted.executionId,
        operationId: requested.operationId,
        inputVersion: '3',
        result: { text: 'summary' },
        cost: { reserved: ceiling, actual: '0.000800' },
      },
    ])
    expect(await clientRows()).toMatchObject([
      { operation_id: requested.operationId, content: { text: 'summary' } },
    ])
    expect(await readBudget()).toMatchObject({
      month: budgetMonth(),
      limit: '100.000000',
      reserved: '0.000000',
      settled: '0.000800',
      available: '99.999200',
    })
  })

  it('A14-AC03: rolling back the client operation rolls back the request and the reservation', async () => {
    const operationId = randomUUID()
    await expect(
      transaction(async () => {
        await db().query(
          'INSERT INTO client_publications(operation_id,content) VALUES($1,$2)',
          [operationId, '{}'],
        )
        await requestExecution(request({ operationId }))
        throw new Error('client operation failed')
      }),
    ).rejects.toThrow('client operation failed')
    expect(await clientRows()).toEqual([])
    expect(await readExecutionHistory(operationId)).toEqual([])
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
        .n,
    ).toBe(0)
    expect(await jobs()).toEqual([])
    expect((await readBudget()).reserved).toBe('0.000000')
  })

  it('A14-AC03: a committed client operation commits the request with it', async () => {
    const operationId = randomUUID()
    const admitted = await transaction(async () => {
      await db().query(
        'INSERT INTO client_publications(operation_id,content) VALUES($1,$2)',
        [operationId, '{}'],
      )
      return requestExecution(request({ operationId }))
    })
    expect(await jobs()).toEqual([admitted.executionId])
    expect(await clientRows()).toHaveLength(1)
  })

  it('A14-AC04: a rejected result still settles the cost incurred', async () => {
    decide = async () => ({ accepted: false, reason: 'quote not found' })
    const admitted = await requestExecution(request())
    answers.push(completed({ text: 'unconfirmed' }))
    await work()
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'rejected',
      result: { text: 'unconfirmed' },
      cause: 'quote not found',
      cost: { reserved: ceiling, actual: '0.000800', unknown: false },
    })
    expect(await readBudget()).toMatchObject({
      reserved: '0.000000',
      settled: '0.000800',
    })
  })

  it('A14-AC04: a result without usage leaves the cost unknown and reserved', async () => {
    const admitted = await requestExecution(request())
    answers.push(
      completed({ text: 'summary' }, { inputTokens: null, outputTokens: 50 }),
    )
    await work()
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'completed',
      cost: { reserved: ceiling, actual: null, unknown: true },
    })
    expect(results[0]!.cost).toEqual({ reserved: ceiling, actual: null })
    expect(await readBudget()).toMatchObject({
      reserved: ceiling,
      settled: '0.000000',
    })
  })

  it('usage above the recorded caps leaves the cost unknown, as before', async () => {
    const admitted = await requestExecution(request())
    answers.push(
      completed({ text: 'summary' }, { inputTokens: 1001, outputTokens: 1 }),
    )
    await work()
    expect((await readExecution(admitted.executionId))!.cost).toEqual({
      reserved: ceiling,
      actual: null,
      unknown: true,
    })
  })

  it('a receiver error rolls back the client writes but keeps the settlement', async () => {
    decide = async () => {
      throw new Error('client bug')
    }
    const admitted = await requestExecution(request())
    answers.push(completed({ text: 'summary' }))
    await work()
    expect(await clientRows()).toEqual([])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'failed',
      cause: 'receiver_error',
      cost: { actual: '0.000800', unknown: false },
    })
  })

  it('a final state without a result reaches the receiver with its cause', async () => {
    const requested = request()
    const admitted = await requestExecution(requested)
    answers.push(async () => ({
      outcome: 'refused',
      text: null,
      usage: { inputTokens: 10, outputTokens: 5 },
      responseId: null,
    }))
    await work()
    expect(failures).toEqual([
      {
        executionId: admitted.executionId,
        operationId: requested.operationId,
        inputVersion: '3',
        cause: 'refused',
        cost: { reserved: ceiling, actual: '0.000080' },
      },
    ])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'failed',
      result: null,
      cause: 'refused',
    })
  })

  it('retries a request that may not have reached the provider as a second attempt', async () => {
    const requested = request()
    const first = await requestExecution(requested)
    answers.push(async () => {
      throw new ModelError('network', { requestSent: true })
    })
    answers.push(completed({ text: 'second' }))
    await work()
    expect(await readExecution(first.executionId)).toMatchObject({
      state: 'retried',
      cause: 'network',
      cost: { actual: null, unknown: true },
    })
    await work()
    const history = await readExecutionHistory(requested.operationId)
    expect(history.map((e) => [e.attempt, e.state])).toEqual([
      [1, 'retried'],
      [2, 'completed'],
    ])
    expect(results.map((r) => r.result)).toEqual([{ text: 'second' }])
  }, 10_000)

  it('keeps one execution in progress per operation', async () => {
    const operationId = randomUUID()
    await requestExecution(request({ operationId }))
    await expect(requestExecution(request({ operationId }))).rejects.toEqual(
      new AiRequestError('operation_busy'),
    )
  })

  it('refuses a job type without configuration', async () => {
    vi.stubEnv('AI_PROFILE_PRICING_JSON', '{broken')
    await expect(requestExecution(request())).rejects.toEqual(
      new AiRequestError('not_configured'),
    )
    expect(await jobs()).toEqual([])
  })

  it('waits for budget and is queued by recovery when funds appear', async () => {
    await pool.query('INSERT INTO ai_budget_months VALUES($1,0)', [
      budgetMonth(),
    ])
    const admitted = await requestExecution(request())
    expect(admitted.state).toBe('waiting_budget')
    expect(await jobs()).toEqual([])
    expect((await readBudget()).reserved).toBe('0.000000')
    await recoverExecutions()
    expect((await readExecution(admitted.executionId))!.state).toBe(
      'waiting_budget',
    )
    await pool.query('UPDATE ai_budget_months SET limit_pln=1')
    await recoverExecutions()
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'queued',
      cost: { reserved: ceiling },
    })
    expect(await jobs()).toEqual([admitted.executionId])
  })

  it('reserves a group as a whole or not at all', async () => {
    await pool.query('INSERT INTO ai_budget_months VALUES($1,0.01)', [
      budgetMonth(),
    ])
    const groupId = randomUUID()
    const items = [
      request({ mode: { kind: 'batch', groupId } }),
      request({ mode: { kind: 'batch', groupId } }),
    ]
    const waiting = await requestExecutionGroup(items)
    expect(waiting.map((e) => e.state)).toEqual([
      'waiting_budget',
      'waiting_budget',
    ])
    await pool.query('UPDATE ai_budget_months SET limit_pln=0.016')
    await recoverExecutions()
    const funded = await Promise.all(
      waiting.map(async (e) => (await readExecution(e.executionId))!),
    )
    expect(funded.map((e) => [e.state, e.groupId, e.cost.reserved])).toEqual([
      ['queued', groupId, ceiling],
      ['queued', groupId, ceiling],
    ])
    // No adapter offers batch mode yet: an explicit final state, nothing spent.
    await work()
    expect(failures[0]).toMatchObject({
      cause: 'unsupported_mode',
      cost: { actual: '0.000000' },
    })
    expect(calls).toEqual([])
  })

  it('E01-AC03: settlement keeps the month of the attempt', async () => {
    const admitted = await requestExecution(request())
    await pool.query("INSERT INTO ai_budget_months VALUES('2020-01',100)")
    await pool.query("UPDATE ai_attempts SET month='2020-01'")
    answers.push(completed({ text: 'summary' }))
    await work()
    expect(
      (await pool.query('SELECT month,state FROM ai_attempts')).rows,
    ).toEqual([{ month: '2020-01', state: 'settled' }])
    expect((await readExecution(admitted.executionId))!.cost.actual).toBe(
      '0.000800',
    )
    expect(await readBudget(new Date('2020-01-15T12:00:00Z'))).toMatchObject({
      settled: '0.000800',
    })
  })
})
