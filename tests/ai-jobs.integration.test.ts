import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool, transaction } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import {
  readExecution,
  requestExecution,
  type RequestedExecution,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import { runPass } from '../periodic/pass.ts'
import { periodicSteps } from '../periodic/steps.ts'
import { aiQueues, prepareAiQueues } from './ai-queue.fixtures.ts'
import {
  localKey,
  paidKey,
  recordTables,
  registerSimulatedProviders,
} from './fixtures/ai/simulated.ts'
import { waitFor } from './worker.fixtures.ts'

vi.mock('../modules/ai/client-settings.ts', () => ({
  clientSettings: {
    'paid-summaries': {
      provider: 'simulated',
      model: 'simulated-model',
      reasoningEffort: null,
    },
    'local-summaries': {
      provider: 'simulated-local',
      model: 'simulated-local-model',
      reasoningEffort: null,
    },
  },
}))
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock('../modules/ai/model-catalog.ts', () => ({
  aiCatalog: {
    providers: {
      simulated: { credentialEnv: null },
      'simulated-local': { credentialEnv: null },
    },
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
      {
        provider: 'simulated-local',
        model: 'simulated-local-model',
        reasoningEfforts: [null],
        prices: {},
        local: { endpointRef: 'test', endpointVersion: 1, numCtx: 4096 },
      },
    ],
  },
}))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

// Ceiling: (1000 * 1 + 500 * 2) / 1e6 USD * 4 = 0.008 PLN per attempt.
const ceiling = '0.008000'

const workerEntry = fileURLToPath(
  new URL('./fixtures/ai/worker.ts', import.meta.url),
)
const carryOverScript = fileURLToPath(
  new URL('../scripts/carry-over-jobs.ts', import.meta.url),
)

type Behaviour = {
  delayMs?: number
  transient?: number
  exit?: boolean
  hang?: boolean
}

type Requested = RequestedExecution & { operationId: string; tag: string }

// B6: AI executions requested in the application and carried out by the
// worker started as in production, with the AI job handler and failure
// handler, simulated providers and test receivers in its pool processes.
// The AI queues take the repository's attempts (4) with a retry delay of
// 1 s and a time limit of 8 s, so that retries and time limits show within
// a test.
integration('AI executions through the queue and worker libraries', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16),
    schema = `aijobs_${suffix}`,
    queueSchema = `aijobs_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool, boss: PgBoss, url: string
  const workers: ChildProcess[] = []

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    url = connection.toString()
    pool = new Pool({ connectionString: url, max: 8 })
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
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
    await pool.query(recordTables)
    await pool.query(`CREATE TABLE service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    )`)
    await pool.query(
      'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,100)',
      [budgetMonth(new Date())],
    )
    setPool(pool)
    await prepareAiQueues(queueSchema, {
      attempts: 4,
      retryDelaySeconds: 1,
      timeLimitSeconds: 8,
    })
    process.env.PG_BOSS_SCHEMA = queueSchema
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
      supervise: false,
      schedule: false,
    })
    boss.on('error', () => {})
    await boss.start()
    registerSimulatedProviders()
  }, 60_000)

  afterAll(async () => {
    for (const child of workers) await kill(child)
    await boss?.stop({ graceful: false })
    await stopQueues()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  }, 60_000)

  async function kill(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGKILL')
    await once(child, 'exit')
  }

  /** Starts a worker of the test plugins on the test schemas, pool size 2. */
  async function startWorker() {
    let output = ''
    const child = spawn(process.execPath, ['--import', 'tsx', workerEntry], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        PG_BOSS_SCHEMA: queueSchema,
        WORKER_POOL_SIZE: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
    workers.push(child)
    await waitFor(
      async () => {
        if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`)
        return output.includes('Worker ready')
      },
      30_000,
      'the worker to be ready',
    )
    return child
  }

  /** A worker that is running, started when none is. */
  async function runningWorker() {
    return (
      workers.find(
        (child) => child.exitCode === null && child.signalCode === null,
      ) ?? startWorker()
    )
  }

  /** Stops the running workers as a deployment does, with a stop signal. */
  async function stopWorkers() {
    for (const child of workers) {
      if (child.exitCode !== null || child.signalCode !== null) continue
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
  }

  /** Requests an execution whose provider behaves as `behaviour` says. */
  async function request(
    key: string,
    behaviour: Behaviour = {},
  ): Promise<Requested> {
    const operationId = randomUUID()
    const tag = randomUUID()
    const requested = await requestExecution({
      settingsKey: key,
      operationId,
      mode: { kind: 'single' },
      instruction: 'Summarise the text.',
      responseSchema: {
        name: 'summary',
        schema: { type: 'object', properties: { text: { type: 'string' } } },
      },
      input: JSON.stringify({ tag, ...behaviour }),
    })
    return { ...requested, operationId, tag }
  }

  const execution = async (id: string) => (await readExecution(id))!

  const stateBecomes = (id: string, state: string, timeoutMs = 60_000) =>
    waitFor(
      async () => {
        const found = await execution(id)
        return found.state === state && found
      },
      timeoutMs,
      `execution ${id} to become ${state}`,
    )

  type Call = { pid: number; started_at: Date; ended_at: Date | null }
  const callsOf = async (tag: string): Promise<Call[]> =>
    (
      await pool.query(
        'SELECT pid,started_at,ended_at FROM provider_calls WHERE tag=$1 ORDER BY started_at',
        [tag],
      )
    ).rows

  type Delivery = {
    kind: string
    state: string | null
    cause: string | null
    accepted: boolean
  }
  const deliveriesOf = async (operationId: string): Promise<Delivery[]> =>
    (
      await pool.query(
        'SELECT kind,state,cause,accepted FROM deliveries WHERE operation_id=$1 ORDER BY at',
        [operationId],
      )
    ).rows

  const jobsOf = async (executionId: string) =>
    (
      await admin.query(
        `SELECT name,state,retry_count,output FROM ${queueSchema}.job
         WHERE data->>'executionId'=$1 ORDER BY created_on`,
        [executionId],
      )
    ).rows as {
      name: string
      state: string
      retry_count: number
      output: { message?: string; reason?: string } | null
    }[]

  const reserved = async () =>
    (
      await pool.query(
        "SELECT coalesce(sum(reserved_pln),0)::text AS sum FROM ai_attempts WHERE state<>'settled'",
      )
    ).rows[0].sum as string

  const overlap = (a: Call, b: Call) =>
    a.started_at < (b.ended_at ?? new Date()) &&
    b.started_at < (a.ended_at ?? new Date())

  describe('deployment (B6-R10)', () => {
    it('carries a waiting, a running and a delivering execution over to the new queues and deletes the former queue, leaving one waiting for budget (B6-AC09, B6-AC10)', async () => {
      await stopWorkers()
      const waiting = await request(paidKey)
      const running = await request(paidKey)
      const delivering = await request(paidKey)
      // The executions as the former path left them: no job in the new
      // queues, one running and one waiting for delivery.
      await admin.query(
        `DELETE FROM ${queueSchema}.job WHERE name=ANY($1::text[])`,
        [aiQueues],
      )
      await pool.query("UPDATE ai_executions SET state='running' WHERE id=$1", [
        running.executionId,
      ])
      await pool.query(
        `UPDATE ai_executions SET state='delivering',result='{"text":"saved"}' WHERE id=$1`,
        [delivering.executionId],
      )
      await pool.query(
        'UPDATE ai_budget_months SET limit_pln=0 WHERE month=$1',
        [budgetMonth(new Date())],
      )
      const budgetless = await request(paidKey)
      await pool.query(
        'UPDATE ai_budget_months SET limit_pln=100 WHERE month=$1',
        [budgetMonth(new Date())],
      )
      expect(budgetless.state).toBe('waiting_budget')
      await boss.createQueue('ai-execution')
      await boss.send('ai-execution', { executionId: waiting.executionId })

      const { stdout } = await promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', carryOverScript],
        {
          env: {
            ...process.env,
            DATABASE_URL: url,
            PG_BOSS_SCHEMA: queueSchema,
          },
        },
      )
      expect(stdout).toContain(
        'Carried 3 jobs over from queue "ai-execution" and deleted it',
      )
      expect(await boss.getQueue('ai-execution')).toBeFalsy()

      await runningWorker()
      await stateBecomes(waiting.executionId, 'completed')
      expect(await callsOf(waiting.tag)).toHaveLength(1)
      expect(await deliveriesOf(waiting.operationId)).toMatchObject([
        { kind: 'result', accepted: true },
      ])
      expect(
        await stateBecomes(running.executionId, 'uncertain'),
      ).toMatchObject({
        cause: 'unknown',
        cost: { reserved: ceiling, actual: null },
      })
      expect(await callsOf(running.tag)).toEqual([])
      expect(await deliveriesOf(running.operationId)).toMatchObject([
        { kind: 'failure', state: 'uncertain', cause: 'unknown' },
      ])
      await stateBecomes(delivering.executionId, 'completed')
      expect(await callsOf(delivering.tag)).toEqual([])
      expect(await deliveriesOf(delivering.operationId)).toMatchObject([
        { kind: 'result', accepted: true },
      ])
      expect(await execution(budgetless.executionId)).toMatchObject({
        state: 'waiting_budget',
      })
      expect(await jobsOf(budgetless.executionId)).toEqual([])

      // A second migration step finds no former queue and changes nothing.
      const again = await promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', carryOverScript],
        {
          env: {
            ...process.env,
            DATABASE_URL: url,
            PG_BOSS_SCHEMA: queueSchema,
          },
        },
      )
      expect(again.stdout).not.toContain('ai-execution')
      // Funded by a pass of the periodic process, it is then carried out
      // (B6-AC01).
      await runPass(
        periodicSteps.filter((step) => step.name.startsWith('fund AI')),
      )
      await stateBecomes(budgetless.executionId, 'completed')
    }, 120_000)
  })

  describe('one at a time (B6-R02)', () => {
    it('carries two paid executions out one after the other, two local ones in request order one after the other, and a paid one beside a local one with pool size 2 (B6-AC02)', async () => {
      await runningWorker()
      const paid = [
        await request(paidKey, { delayMs: 1500 }),
        await request(paidKey, { delayMs: 1500 }),
      ]
      const local = [
        await request(localKey, { delayMs: 1500 }),
        await request(localKey, { delayMs: 1500 }),
      ]
      for (const requested of [...paid, ...local])
        await stateBecomes(requested.executionId, 'completed')
      const [p1, p2, l1, l2] = await Promise.all(
        [...paid, ...local].map(async (r) => (await callsOf(r.tag))[0]!),
      )
      expect(overlap(p1!, p2!)).toBe(false)
      expect(overlap(l1!, l2!)).toBe(false)
      expect(l1!.started_at < l2!.started_at).toBe(true)
      expect(
        [p1!, p2!].some((p) => [l1!, l2!].some((l) => overlap(p, l))),
      ).toBe(true)
      expect((await jobsOf(local[0]!.executionId))[0]).toMatchObject({
        name: 'ai-execution-local',
      })
      expect((await jobsOf(paid[0]!.executionId))[0]).toMatchObject({
        name: 'ai-execution-paid',
      })
    }, 120_000)
  })

  describe('carrying out (B6-R03)', () => {
    it('retries a transient error once as a new execution after the provider asks to wait (B6-AC03)', async () => {
      await runningWorker()
      const requested = await request(paidKey, { transient: 500 })
      await stateBecomes(requested.executionId, 'retried')
      const calls = await callsOf(requested.tag)
      await waitFor(
        async () => (await callsOf(requested.tag)).length === 2,
        30_000,
        'the second call',
      )
      const [first, second] = await callsOf(requested.tag)
      expect(
        second!.started_at.getTime() - first!.ended_at!.getTime(),
      ).toBeGreaterThanOrEqual(450)
      expect(calls.length).toBeGreaterThan(0)
      await waitFor(
        async () =>
          (await deliveriesOf(requested.operationId)).some(
            (delivery) => delivery.accepted,
          ),
        30_000,
        'the result of the new execution',
      )
    }, 60_000)

    it('delivers again after a receiver failed once, without calling the provider again (B6-AC03)', async () => {
      await runningWorker()
      const requested = await request(paidKey)
      await pool.query(
        'INSERT INTO receiver_failures(operation_id,remaining) VALUES($1,1)',
        [requested.operationId],
      )
      await stateBecomes(requested.executionId, 'completed')
      expect(await callsOf(requested.tag)).toHaveLength(1)
      expect(await deliveriesOf(requested.operationId)).toMatchObject([
        { kind: 'result', accepted: false },
        { kind: 'result', accepted: true },
      ])
    }, 60_000)

    it('leaves an execution whose receiver keeps failing waiting for delivery with its cost reserved, after 4 deliveries, also after its failure handler (B6-AC03, B6-AC07)', async () => {
      await runningWorker()
      const requested = await request(paidKey)
      await pool.query(
        'INSERT INTO receiver_failures(operation_id,remaining) VALUES($1,99)',
        [requested.operationId],
      )
      await waitFor(
        async () =>
          (await jobsOf(requested.executionId)).find(
            (job) =>
              job.name === 'ai-execution-paid.failed' &&
              job.state === 'completed',
          ),
        60_000,
        'the failure handler to end',
      )
      expect(await execution(requested.executionId)).toMatchObject({
        state: 'delivering',
        cost: { reserved: ceiling },
      })
      expect(await callsOf(requested.tag)).toHaveLength(1)
      expect(await deliveriesOf(requested.operationId)).toHaveLength(4)
    }, 90_000)
  })

  describe('interrupted work (B6-R05)', () => {
    // ASSUMPTION(oferty-pracy-2ba.1/ASM-4): the pool process that exits by
    // itself fails its attempt at once, so the next attempt finds the
    // execution running within the waits below, with retry_count 1.
    it.each([
      ['a paid', paidKey],
      ['a local', localKey],
    ])(
      'ends %s execution whose process was lost as uncertain with the cause unknown at the next attempt, delivers that end and calls the provider no more (B6-AC05)',
      async (_, key) => {
        await runningWorker()
        const before = await reserved()
        const requested = await request(key, { exit: true })
        expect(
          await stateBecomes(requested.executionId, 'uncertain'),
        ).toMatchObject({ cause: 'unknown' })
        await waitFor(
          async () => (await deliveriesOf(requested.operationId)).length > 0,
          30_000,
          'the end to be delivered',
        )
        expect(await deliveriesOf(requested.operationId)).toMatchObject([
          { kind: 'failure', state: 'uncertain', cause: 'unknown' },
        ])
        expect(await callsOf(requested.tag)).toHaveLength(1)
        // The lost attempt failed and the next one ended the execution.
        const [job] = await jobsOf(requested.executionId)
        expect(job).toMatchObject({ state: 'completed', retry_count: 1 })
        // A paid execution keeps its reservation; local work costs nothing.
        expect(await reserved()).toBe(
          key === paidKey
            ? (Number(before) + Number(ceiling)).toFixed(6)
            : Number(before).toFixed(6),
        )
      },
      60_000,
    )
  })

  describe('failure (B6-R07)', () => {
    it('ends a waiting execution whose every attempt failed as uncertain with the cause unknown, keeping its reservation, and delivers that end (B6-AC07)', async () => {
      await stopWorkers()
      const requested = await request(paidKey)
      await pool.query(
        // Each of its 4 attempts fails before handling it; the job that then
        // delivers its end does not.
        'INSERT INTO handler_failures(execution_id,remaining) VALUES($1,4)',
        [requested.executionId],
      )
      await runningWorker()
      expect(
        await stateBecomes(requested.executionId, 'uncertain'),
      ).toMatchObject({
        cause: 'unknown',
        cost: { reserved: ceiling, actual: null },
      })
      await waitFor(
        async () => (await deliveriesOf(requested.operationId)).length > 0,
        30_000,
        'the end to be delivered',
      )
      expect(await deliveriesOf(requested.operationId)).toMatchObject([
        { kind: 'failure', state: 'uncertain', cause: 'unknown' },
      ])
      expect(await callsOf(requested.tag)).toEqual([])
    }, 60_000)

    it('ends an execution running in its last attempt as uncertain with the cause unknown when the attempt passes its time limit (B6-AC07)', async () => {
      await stopWorkers()
      const requested = await request(paidKey, { hang: true })
      // The first three attempts fail before handling it; the last one runs.
      await pool.query(
        'INSERT INTO handler_failures(execution_id,remaining) VALUES($1,3)',
        [requested.executionId],
      )
      await runningWorker()
      await stateBecomes(requested.executionId, 'running', 30_000)
      expect(
        await stateBecomes(requested.executionId, 'uncertain'),
      ).toMatchObject({
        cause: 'unknown',
        cost: { reserved: ceiling, actual: null },
      })
      await waitFor(
        async () => (await deliveriesOf(requested.operationId)).length > 0,
        30_000,
        'the end to be delivered',
      )
      expect(await deliveriesOf(requested.operationId)).toMatchObject([
        { kind: 'failure', state: 'uncertain', cause: 'unknown' },
      ])
      const attempt = (await jobsOf(requested.executionId))[0]!
      expect(attempt).toMatchObject({ state: 'failed', retry_count: 3 })
      expect(attempt.output?.reason).toBe('time-limit')
    }, 90_000)

    it('ends an execution running in its last attempt as uncertain with the cause unknown after the worker is killed during it (B6-AC07)', async () => {
      await stopWorkers()
      const requested = await request(paidKey, { hang: true })
      await pool.query(
        'INSERT INTO handler_failures(execution_id,remaining) VALUES($1,3)',
        [requested.executionId],
      )
      const worker = await runningWorker()
      await stateBecomes(requested.executionId, 'running', 30_000)
      await kill(worker)
      await runningWorker()
      expect(
        await stateBecomes(requested.executionId, 'uncertain', 90_000),
      ).toMatchObject({
        cause: 'unknown',
        cost: { reserved: ceiling, actual: null },
      })
      await waitFor(
        async () => (await deliveriesOf(requested.operationId)).length > 0,
        30_000,
        'the end to be delivered',
      )
      expect(await deliveriesOf(requested.operationId)).toMatchObject([
        { kind: 'failure', state: 'uncertain', cause: 'unknown' },
      ])
      expect(await callsOf(requested.tag)).toHaveLength(1)
    }, 150_000)
  })

  describe('requesting (B6-R01)', () => {
    it('leaves no execution, reservation or job when the requesting operation is rolled back (B6-AC01)', async () => {
      const before = await reserved()
      const operationId = randomUUID()
      await expect(
        transaction(async () => {
          await requestExecution({
            settingsKey: paidKey,
            operationId,
            mode: { kind: 'single' },
            instruction: 'Summarise the text.',
            responseSchema: {
              name: 'summary',
              schema: {
                type: 'object',
                properties: { text: { type: 'string' } },
              },
            },
            input: JSON.stringify({ tag: randomUUID() }),
          })
          throw new Error('The operation failed')
        }),
      ).rejects.toThrow('The operation failed')
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM ai_executions WHERE operation_id=$1',
            [operationId],
          )
        ).rows[0].n,
      ).toBe(0)
      expect(await reserved()).toBe(before)
      const jobs = await admin.query(
        `SELECT count(*)::int AS n FROM ${queueSchema}.job j
         WHERE name=ANY($1::text[]) AND NOT EXISTS (
           SELECT 1 FROM ${schema}.ai_executions e WHERE e.id::text=j.data->>'executionId')`,
        [aiQueues],
      )
      expect(jobs.rows[0].n).toBe(0)
    })
  })
})
