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
  executionCauses,
  readBudget,
  readExecution,
  readExecutionHistory,
  recoverExecutions,
  registerResultReceiver,
  requestExecution,
  requestExecutionGroup,
  runExecution,
  useAiQueue,
  type ExecutionFailureDelivery,
  type ExecutionRequest,
  type ExecutionResultDelivery,
  type ReceiverDecision,
} from './index.ts'
import { budgetMonth } from './domain/cost.ts'
import { admitExecutions } from './admit-executions.ts'
import { executionSettings } from './execution-settings.ts'
import {
  ModelError,
  type ModelResult,
  type ModelUsage,
  type ProviderAdapter,
} from './provider-adapter.ts'
import { registerProviderAdapter } from './provider-registry.ts'

// A client's own settings key, a simulated provider and its price list.
// AI must work with any key a client defines.
const settingsKey = 'summaries'
vi.mock('./client-settings.ts', () => ({
  clientSettings: {
    summaries: {
      provider: 'simulated',
      model: 'simulated-model',
      reasoningEffort: null,
    },
    // A client that registered no receiver.
    unreceived: {
      provider: 'simulated',
      model: 'simulated-model',
      reasoningEffort: null,
    },
  },
}))
vi.mock('./model-catalog.ts', () => ({
  aiCatalog: {
    providers: { simulated: { credentialEnv: null } },
    models: [
      {
        provider: 'simulated',
        model: 'simulated-model',
        reasoningEfforts: [null],
        prices: {
          single: {
            model: 'simulated-model',
            version: 'prices-1',
            inputUsdPerMillion: '1',
            outputUsdPerMillion: '2',
            usdPln: '4',
            fxVersion: 'fx-1',
            maxInputTokens: 1000,
            maxOutputTokens: 500,
          },
        },
      },
    ],
  },
}))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

// Ceiling: (1000 * 1 + 500 * 2) / 1e6 USD * 4 = 0.008 PLN per attempt.
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
  let adapterPresent: boolean
  let decide: (delivery: ExecutionResultDelivery) => Promise<ReceiverDecision>
  let results: ExecutionResultDelivery[]
  let failures: ExecutionFailureDelivery[]
  let receiveFailure: () => Promise<void>

  const completed =
    (
      result: unknown,
      usage: ModelUsage = { inputTokens: 100, outputTokens: 50 },
    ) =>
    async (): Promise<ModelResult> => ({
      outcome: 'completed',
      text: JSON.stringify(result),
      usage,
      responseId: 'response-1',
    })

  const request = (
    overrides: Partial<ExecutionRequest> = {},
  ): ExecutionRequest => ({
    settingsKey,
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

  /**
   * Takes the next job from the queue and handles it like the worker: an
   * error fails the job, so the queue retries it.
   */
  async function work() {
    const [job] = await boss.fetch<{ executionId: string }>(aiExecutionQueue)
    if (!job) throw new Error('Expected a queued AI job')
    try {
      await runExecution(job.data.executionId)
    } catch (error) {
      await boss.fail(aiExecutionQueue, job.id, { message: String(error) })
      throw error
    }
    await boss.complete(aiExecutionQueue, job.id)
    return job.data.executionId
  }

  const jobState = async (executionId: string) =>
    (
      await admin.query(
        `SELECT state, retry_count FROM ${queueSchema}.job WHERE name=$1 AND data->>'executionId'=$2`,
        [aiExecutionQueue, executionId],
      )
    ).rows

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
      '1770000000017_profile_ai_executions',
      '1770000000007_matching_payload',
      '1770000000008_matching_groups',
      '1770000000018_matching_ai_executions',
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
    const single: NonNullable<ProviderAdapter['modes']['single']> = () => ({
      async generate(modelRequest) {
        calls.push(modelRequest)
        const answer = answers.shift()
        if (!answer) throw new Error('Unexpected provider call')
        return answer()
      },
    })
    // The simulated adapter declares single mode while it is present.
    // The simulated adapter decides the public end of what it observed:
    // its errors carry the cause, and an error it marks as not ended is
    // uncertain.
    registerProviderAdapter({
      provider: 'simulated',
      get modes() {
        return adapterPresent ? { single } : {}
      },
      endOf(observation) {
        if (observation.kind === 'outcome')
          return { state: 'failed', cause: observation.outcome }
        if (observation.kind === 'lost_lease')
          return { state: 'uncertain', cause: 'interrupted' }
        const error = observation.error
        if (!(error instanceof ModelError))
          return { state: 'failed', cause: 'unknown' }
        return {
          state: error.details.runtimeEnded === false ? 'uncertain' : 'failed',
          cause: error.code,
        }
      },
    })
    registerResultReceiver(settingsKey, {
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
        await receiveFailure()
      },
    })
  }, 30_000)

  beforeEach(async () => {
    answers = []
    adapterPresent = true
    calls = []
    results = []
    failures = []
    decide = async () => ({ accepted: true })
    receiveFailure = async () => {}
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
      cost: { reserved: ceiling, actual: null },
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
      cost: { reserved: ceiling, actual: '0.000800' },
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
      // The reason is kept apart from the cause, which stays in its list.
      cause: null,
      rejectionReason: 'quote not found',
      cost: { reserved: ceiling, actual: '0.000800' },
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
      cost: { reserved: ceiling, actual: null },
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
    })
  })

  it('A14-AC09: a receiver error keeps the result for another delivery, which settles once without calling the provider again', async () => {
    let deliveries = 0
    decide = async () => {
      deliveries++
      if (deliveries === 1) throw new Error('client bug')
      return { accepted: true }
    }
    const admitted = await requestExecution(request())
    answers.push(completed({ text: 'summary' }))
    await expect(work()).rejects.toThrow('client bug')

    // Delivering: the result is saved, the cost reserved, the client's
    // writes and the settlement rolled back, and the job is retried.
    expect(await clientRows()).toEqual([])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'delivering',
      result: { text: 'summary' },
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: { reserved: ceiling, actual: null },
      cause: null,
      delivery: { attempts: 1, lastError: 'Error: client bug' },
      finishedAt: null,
    })
    expect(await readBudget()).toMatchObject({
      reserved: ceiling,
      settled: '0.000000',
    })
    expect(await jobState(admitted.executionId)).toEqual([
      { state: 'retry', retry_count: 0 },
    ])
    expect(aiExecutionJobOptions.retryLimit).toBeGreaterThan(0)

    // The queue's retry runs the same job again.
    await runExecution(admitted.executionId)
    expect(calls).toHaveLength(1)
    expect(results).toHaveLength(2)
    expect(await clientRows()).toHaveLength(1)
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'completed',
      cost: { reserved: ceiling, actual: '0.000800' },
      delivery: { attempts: 2, lastError: 'Error: client bug' },
    })
    expect(await readBudget()).toMatchObject({
      reserved: '0.000000',
      settled: '0.000800',
    })
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM ai_attempts WHERE state='settled'",
        )
      ).rows[0].n,
    ).toBe(1)

    // Another copy of the job finds the execution delivered.
    await runExecution(admitted.executionId)
    expect(results).toHaveLength(2)
    expect(calls).toHaveLength(1)
  })

  it('A14-AC09: a receiver that keeps failing leaves the execution waiting for delivery with the cost reserved', async () => {
    decide = async () => {
      throw new Error('still broken')
    }
    const requested = request()
    const admitted = await requestExecution(requested)
    answers.push(completed({ text: 'summary' }))
    await expect(work()).rejects.toThrow('still broken')
    // The first run and every retry of the queue.
    for (let retry = 0; retry < aiExecutionJobOptions.retryLimit; retry++)
      await expect(runExecution(admitted.executionId)).rejects.toThrow(
        'still broken',
      )
    expect(calls).toHaveLength(1)
    expect(await clientRows()).toEqual([])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'delivering',
      result: { text: 'summary' },
      cost: { reserved: ceiling, actual: null },
      delivery: {
        attempts: aiExecutionJobOptions.retryLimit + 1,
        lastError: 'Error: still broken',
      },
    })
    expect((await readBudget()).reserved).toBe(ceiling)
    // Still in progress: the operation gets no second execution.
    await expect(
      requestExecution(request({ operationId: requested.operationId })),
    ).rejects.toEqual(new AiRequestError('operation_busy'))
  })

  it('A14-AC09: a final state without a result is delivered again after a receiver error', async () => {
    let deliveries = 0
    receiveFailure = async () => {
      deliveries++
      if (deliveries === 1) throw new Error('client bug')
    }
    const admitted = await requestExecution(request())
    answers.push(async () => {
      throw new ModelError('http', {
        requestSent: true,
        responseReceived: true,
      })
    })
    await expect(work()).rejects.toThrow('client bug')
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'delivering',
      cause: 'http',
      cost: { actual: null },
    })
    await runExecution(admitted.executionId)
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'failed',
      cause: 'http',
      cost: { actual: null },
    })
    expect(failures).toHaveLength(2)
    expect(calls).toHaveLength(1)
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
        state: 'failed',
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

  it('retries an error the adapter judges transient as a second attempt', async () => {
    const requested = request()
    const first = await requestExecution(requested)
    answers.push(async () => {
      throw new ModelError('network', { requestSent: true, transient: true })
    })
    answers.push(completed({ text: 'second' }))
    await work()
    expect(await readExecution(first.executionId)).toMatchObject({
      state: 'retried',
      cause: 'network',
      cost: { actual: null },
    })
    await work()
    const history = await readExecutionHistory(requested.operationId)
    expect(history.map((e) => [e.attempt, e.state])).toEqual([
      [1, 'retried'],
      [2, 'completed'],
    ])
    expect(results.map((r) => r.result)).toEqual([{ text: 'second' }])
  }, 10_000)

  it('ends an error the adapter does not judge transient without a retry, whatever its protocol details', async () => {
    const requested = request()
    const admitted = await requestExecution(requested)
    answers.push(async () => {
      throw new ModelError('http', {
        requestSent: true,
        responseReceived: true,
        httpStatus: 503,
        retryAfterMs: 1000,
      })
    })
    await work()
    expect(await jobs()).toEqual([])
    expect(await readExecutionHistory(requested.operationId)).toMatchObject([
      { id: admitted.executionId, state: 'failed', cause: 'http' },
    ])
    expect(failures).toMatchObject([{ cause: 'http' }])
  })

  it.each<[string, ExecutionRequest['mode']]>([
    ['batch', { kind: 'batch', groupId: randomUUID() }],
    ['agent', { kind: 'agent', tools: ['web_search'] }],
  ])(
    'A14-AC10: refuses %s work no adapter declares, with nothing reserved or queued',
    async (_, mode) => {
      const requested = request({ mode })
      await expect(requestExecution(requested)).rejects.toEqual(
        new AiRequestError('unsupported_mode'),
      )
      expect(await readExecutionHistory(requested.operationId)).toEqual([])
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
          .n,
      ).toBe(0)
      expect(await jobs()).toEqual([])
      expect((await readBudget()).reserved).toBe('0.000000')
    },
  )

  it('A14-AC10: refuses a batch group no adapter declares, with nothing reserved', async () => {
    const groupId = randomUUID()
    await expect(
      requestExecutionGroup([
        request({ mode: { kind: 'batch', groupId } }),
        request({ mode: { kind: 'batch', groupId } }),
      ]),
    ).rejects.toEqual(new AiRequestError('unsupported_mode'))
    expect(await jobs()).toEqual([])
    expect((await readBudget()).reserved).toBe('0.000000')
  })

  it('ends a completed response that is not JSON without a result and settles its cost', async () => {
    const admitted = await requestExecution(request())
    answers.push(async () => ({
      outcome: 'completed',
      text: 'not json',
      usage: { inputTokens: 100, outputTokens: 50 },
      responseId: null,
    }))
    await work()
    expect(results).toEqual([])
    expect(failures).toMatchObject([{ cause: 'format' }])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'failed',
      result: null,
      cause: 'format',
      cost: { actual: '0.000800' },
    })
  })

  it('answers concurrent requests of one operation with one execution and a defined error', async () => {
    const operationId = randomUUID()
    const outcomes = await Promise.allSettled([
      requestExecution(request({ operationId })),
      requestExecution(request({ operationId })),
    ])
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(
      outcomes.flatMap((o) => (o.status === 'rejected' ? [o.reason] : [])),
    ).toEqual([new AiRequestError('operation_busy')])
    expect(await readExecutionHistory(operationId)).toHaveLength(1)
  })

  it('keeps one execution in progress per operation', async () => {
    const operationId = randomUUID()
    await requestExecution(request({ operationId }))
    await expect(requestExecution(request({ operationId }))).rejects.toEqual(
      new AiRequestError('operation_busy'),
    )
  })

  it('A14-AC08: refuses a settings key without settings, with nothing reserved', async () => {
    await expect(
      requestExecution(request({ settingsKey: 'unknown-client' })),
    ).rejects.toEqual(new AiRequestError('not_configured'))
    expect(await jobs()).toEqual([])
    expect((await readBudget()).reserved).toBe('0.000000')
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

  it('reserves a group as a whole or not at all, at request and in recovery', async () => {
    // The shared admission, as a group request will use it once an adapter
    // runs batch mode (task oferty-pracy-0mq.17).
    await pool.query('INSERT INTO ai_budget_months VALUES($1,0.01)', [
      budgetMonth(),
    ])
    const settings = executionSettings(settingsKey, 'single')
    const groupId = randomUUID()
    const admission = () => ({
      settingsKey,
      operationId: randomUUID(),
      inputVersion: null,
      mode: 'batch' as const,
      groupId,
      supersedes: null,
      snapshot: {
        kind: 'ai-execution' as const,
        settings,
        instruction: 'Summarise the text.',
        responseSchema: request().responseSchema,
        input: 'Some text',
        tools: [],
      },
      attempt: 1,
      generation: randomUUID(),
    })
    const waiting = await transaction(() =>
      admitExecutions([admission(), admission()], settings),
    )
    expect(waiting.map((e) => e.state)).toEqual([
      'waiting_budget',
      'waiting_budget',
    ])
    expect((await readBudget()).reserved).toBe('0.000000')
    // Funds for one item only: the group still waits.
    await pool.query('UPDATE ai_budget_months SET limit_pln=0.009')
    await recoverExecutions()
    expect(
      (await Promise.all(waiting.map((e) => readExecution(e.executionId)))).map(
        (e) => e!.state,
      ),
    ).toEqual(['waiting_budget', 'waiting_budget'])
    await pool.query('UPDATE ai_budget_months SET limit_pln=0.016')
    await recoverExecutions()
    const funded = await Promise.all(
      waiting.map(async (e) => (await readExecution(e.executionId))!),
    )
    expect(funded.map((e) => [e.state, e.groupId, e.cost.reserved])).toEqual([
      ['queued', groupId, ceiling],
      ['queued', groupId, ceiling],
    ])
  })

  it('ends an execution whose adapter disappeared before it ran as an AI failure, with nothing charged', async () => {
    const admitted = await requestExecution(request())
    adapterPresent = false
    await work()
    expect(calls).toEqual([])
    expect(failures).toMatchObject([
      { cause: 'adapter_unavailable', cost: { actual: '0.000000' } },
    ])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'failed',
      cause: 'adapter_unavailable',
      cost: { actual: '0.000000' },
    })
  })

  it('ends a JSON result that does not match the response schema without a result and settles its cost', async () => {
    const admitted = await requestExecution(request())
    answers.push(completed({ text: 42 }))
    await work()
    expect(results).toEqual([])
    expect(failures).toMatchObject([{ cause: 'format' }])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'failed',
      result: null,
      cause: 'format',
      cost: { actual: '0.000800' },
    })
  })

  it('refuses a response schema it cannot check, with nothing reserved', async () => {
    const requested = request({
      responseSchema: { name: 'broken', schema: { type: 'no-such-type' } },
    })
    await expect(requestExecution(requested)).rejects.toEqual(
      new AiRequestError('invalid_request'),
    )
    expect(await jobs()).toEqual([])
    expect((await readBudget()).reserved).toBe('0.000000')
  })

  it('treats a missing receiver as a failed delivery: the result is kept and the job retried', async () => {
    const admitted = await requestExecution(
      request({ settingsKey: 'unreceived' }),
    )
    answers.push(completed({ text: 'summary' }))
    await expect(work()).rejects.toThrow('No receiver')
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'delivering',
      result: { text: 'summary' },
      cost: { reserved: ceiling, actual: null },
      delivery: {
        attempts: 1,
        lastError: 'Error: No receiver for settings key unreceived',
      },
    })
    expect(await jobState(admitted.executionId)).toEqual([
      { state: 'retry', retry_count: 0 },
    ])
  })

  it('leaves an execution waiting for delivery alone in recovery', async () => {
    decide = async () => {
      throw new Error('client bug')
    }
    const admitted = await requestExecution(request())
    answers.push(completed({ text: 'summary' }))
    await expect(work()).rejects.toThrow('client bug')
    await admin.query(`DELETE FROM ${queueSchema}.job WHERE name=$1`, [
      aiExecutionQueue,
    ])
    await recoverExecutions()
    expect(await jobs()).toEqual([])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'delivering',
      delivery: { attempts: 1 },
    })
    expect(results).toHaveLength(1)
  })

  it('A14-AC12: an end the adapter judges uncertain keeps the cost reserved, reaches the receiver and frees the operation', async () => {
    const requested = request()
    const admitted = await requestExecution(requested)
    answers.push(async () => {
      throw new ModelError('network', {
        requestSent: true,
        runtimeEnded: false,
      })
    })
    await work()
    const execution = await readExecution(admitted.executionId)
    expect(execution).toMatchObject({
      state: 'uncertain',
      cause: 'network',
      result: null,
      cost: { reserved: ceiling, actual: null },
    })
    expect(Object.keys(execution!.cost)).toEqual(['reserved', 'actual'])
    expect(executionCauses).toContain(execution!.cause)
    expect(failures).toMatchObject([
      { state: 'uncertain', cause: 'network', cost: { actual: null } },
    ])
    expect((await readBudget()).reserved).toBe(ceiling)
    // A person checks the execution before trying again; the operation
    // takes a new request.
    expect(
      (
        await requestExecution({
          ...request(),
          operationId: requested.operationId,
        })
      ).state,
    ).toBe('queued')
  })

  it('A14-AC11: keeps the end an adapter decided only while it waits for delivery', async () => {
    let deliveries = 0
    receiveFailure = async () => {
      deliveries++
      if (deliveries === 1) throw new Error('client bug')
    }
    const admitted = await requestExecution(request())
    answers.push(async () => {
      throw new ModelError('network', {
        requestSent: true,
        runtimeEnded: false,
      })
    })
    const columns = async () =>
      (
        await pool.query(
          'SELECT state, cause, end_state FROM ai_executions WHERE id=$1',
          [admitted.executionId],
        )
      ).rows[0]
    await expect(work()).rejects.toThrow('client bug')
    expect(await columns()).toEqual({
      state: 'delivering',
      cause: 'network',
      end_state: 'uncertain',
    })
    await runExecution(admitted.executionId)
    expect(await columns()).toEqual({
      state: 'uncertain',
      cause: 'network',
      end_state: null,
    })
    await expect(
      pool.query("UPDATE ai_executions SET end_state='failed' WHERE id=$1", [
        admitted.executionId,
      ]),
    ).rejects.toThrow('ai_executions_end_state_check')
  })

  it('A14-AC11: keeps the stage only in the execution; the attempt holds the settlement status', async () => {
    decide = async () => {
      throw new Error('client bug')
    }
    const admitted = await requestExecution(request())
    const attempt = async () =>
      (
        await pool.query(
          'SELECT state, error FROM ai_attempts WHERE execution_id=$1',
          [admitted.executionId],
        )
      ).rows[0]
    expect(await attempt()).toEqual({ state: 'open', error: null })
    answers.push(completed({ text: 'summary' }))
    await expect(work()).rejects.toThrow('client bug')
    expect((await readExecution(admitted.executionId))!.state).toBe(
      'delivering',
    )
    expect(await attempt()).toEqual({ state: 'open', error: null })
    decide = async () => ({ accepted: false, reason: 'quote not found' })
    await runExecution(admitted.executionId)
    expect(await attempt()).toEqual({ state: 'settled', error: null })
    expect(
      (
        await pool.query(
          'SELECT state, cause, rejection_reason, result_status, error_code, disposition, publication_allowed, runtime_state FROM ai_executions WHERE id=$1',
          [admitted.executionId],
        )
      ).rows[0],
    ).toEqual({
      state: 'rejected',
      cause: null,
      rejection_reason: 'quote not found',
      result_status: null,
      error_code: null,
      disposition: 'active',
      publication_allowed: true,
      runtime_state: 'not_started',
    })
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
