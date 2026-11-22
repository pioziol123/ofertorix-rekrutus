import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool, transaction } from '../lib/db.ts'
import {
  applyQueueConfiguration,
  createQueue,
  stopQueues,
} from '../lib/queues/index.ts'
import { placeAssignment } from '../modules/ai/index.ts'
import {
  localTestJob,
  operationCallsTable,
  paidTestJob,
  registerTestExecutors,
} from './fixtures/ai/operation-executors.ts'
import { receiverTables } from './fixtures/ai/operation-receivers.ts'
import { waitFor } from './worker.fixtures.ts'

// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock('../modules/ai/assignments/assignment-settings.ts', () => ({
  assignmentSettings: {
    paid: {
      executor: 'test-paid',
      parameters: { model: 'test' },
      requestingModule: 'Tests',
    },
    local: {
      executor: 'test-local',
      parameters: { model: 'test' },
      requestingModule: 'Tests',
    },
  },
}))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const workerEntry = fileURLToPath(
  new URL('./fixtures/ai/operation-worker.ts', import.meta.url),
)

// T3-R01 of epic sq2: assignments placed in the application and carried out
// by the worker started as in production, pool size 2, with the handler of
// operations on the queues of a paid and a local test executor.
integration('operations of assignments through the worker', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16),
    schema = `aiops_${suffix}`,
    queueSchema = `aiops_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool, url: string
  let worker: ChildProcess | undefined

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    url = connection.toString()
    pool = new Pool({ connectionString: url, max: 4 })
    const sql: string[] = []
    for (const migration of [
      '1770000000004_profiles',
      '1770000000027_ai_assignments',
      '1770000000030_ai_operation_exchange',
      '1770000000031_ai_budget_default_limit',
      '1770000000035_ai_budget_carried_amounts',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
    await pool.query(operationCallsTable)
    await pool.query(receiverTables)
    await pool.query(`CREATE TABLE service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    )`)
    setPool(pool)
    process.env.PG_BOSS_SCHEMA = queueSchema
    for (const job of [paidTestJob, localTestJob])
      await createQueue(job.queue, 'exclusivity')
    // Two attempts with no delay: the failure handler is reached quickly.
    await applyQueueConfiguration({
      [paidTestJob.queue]: {
        attempts: 2,
        retryDelaySeconds: 0,
        timeLimitSeconds: 60,
      },
      [localTestJob.queue]: {
        attempts: 2,
        retryDelaySeconds: 0,
        timeLimitSeconds: 60,
      },
    })
    registerTestExecutors()
  }, 60_000)

  afterAll(async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      worker.kill('SIGKILL')
      await once(worker, 'exit')
    }
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

  async function startWorker() {
    let output = ''
    const child = spawn(process.execPath, ['--import', 'tsx', workerEntry], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        PG_BOSS_SCHEMA: queueSchema,
        WORKER_POOL_SIZE: '2',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
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

  /**
   * Places an assignment whose executor takes `delayMs` to answer, ending
   * uncertain when asked; with `holdDelivery` the first delivery of its
   * result does not return.
   */
  async function place(
    settingsName: 'paid' | 'local',
    delayMs: number,
    uncertain = false,
    holdDelivery = false,
  ) {
    const tag = randomUUID()
    const { assignmentId } = await transaction(() =>
      placeAssignment({
        settingsName,
        type: 'single',
        label: tag,
        instruction: 'Summarise the text.',
        input: JSON.stringify({ tag, delayMs, uncertain, holdDelivery }),
        responseFormat: { name: 'summary', schema: { type: 'object' } },
      }),
    )
    return { assignmentId, tag }
  }

  type Call = { tag: string; started_at: Date; ended_at: Date }
  const overlap = (a: Call, b: Call) =>
    a.started_at < b.ended_at && b.started_at < a.ended_at

  it('carries two assignments of the paid executor out one after the other in the order placed, and one of the local executor at the same time (T3-AC01, T3-R01)', async () => {
    const first = await place('paid', 1500)
    const second = await place('paid', 1500)
    const local = await place('local', 1500)
    worker = await startWorker()
    const ended = await waitFor(
      async () => {
        const { rows } = await pool.query(
          `SELECT a.label AS tag,o.state FROM ai_operations o
           JOIN ai_assignments a ON a.id=o.assignment_id`,
        )
        return (
          rows.length === 3 &&
          rows.every((row: { state: string }) => row.state === 'succeeded') &&
          rows
        )
      },
      60_000,
      'every operation to succeed',
    )
    expect(ended).toHaveLength(3)
    const calls = new Map<string, Call>(
      (
        await pool.query<Call>(
          'SELECT tag,started_at,ended_at FROM operation_calls',
        )
      ).rows.map((call) => [call.tag, call]),
    )
    const [p1, p2, l] = [first, second, local].map((placed) =>
      calls.get(placed.tag)!,
    )
    expect(calls.size).toBe(3)
    expect(overlap(p1!, p2!)).toBe(false)
    expect(p1!.ended_at <= p2!.started_at).toBe(true)
    expect(overlap(p1!, l!) || overlap(p2!, l!)).toBe(true)
  }, 120_000)

  const statusOf = async (assignmentId: string) =>
    (
      await pool.query('SELECT status FROM ai_assignments WHERE id=$1', [
        assignmentId,
      ])
    ).rows[0].status as string

  const receiverCallsOf = async (assignmentId: string) =>
    (
      await pool.query(
        'SELECT entry FROM receiver_calls WHERE assignment_id=$1',
        [assignmentId],
      )
    ).rows.map((row: { entry: string }) => row.entry)

  const receiverSavesOf = async (assignmentId: string) =>
    (
      await pool.query(
        'SELECT entry,saved_at FROM receiver_saves WHERE assignment_id=$1',
        [assignmentId],
      )
    ).rows as { entry: string; saved_at: Date }[]

  it('delivers the result of an operation of the paid executor in its own process while the local executor carries out an operation, with no other background work (T6-AC01, T6-R03)', async () => {
    worker ??= await startWorker()
    const since = (await pool.query<{ now: Date }>('SELECT now()')).rows[0]!.now
    const local = await place('local', 5000)
    const paid = await place('paid', 0)
    await waitFor(
      async () => (await statusOf(paid.assignmentId)) === 'succeeded',
      60_000,
      'the paid assignment to succeed',
    )
    const [save] = await receiverSavesOf(paid.assignmentId)
    expect(save).toMatchObject({ entry: 'result' })
    expect(await receiverCallsOf(paid.assignmentId)).toEqual(['result'])
    // The local operation was still being carried out at the delivery.
    const { rows: localCall } = await pool.query(
      'SELECT started_at,ended_at FROM operation_calls WHERE tag=$1',
      [local.tag],
    )
    expect(localCall[0].started_at < save!.saved_at).toBe(true)
    expect(
      localCall[0].ended_at === null || save!.saved_at < localCall[0].ended_at,
    ).toBe(true)
    await waitFor(
      async () => (await statusOf(local.assignmentId)) === 'succeeded',
      60_000,
      'the local assignment to succeed',
    )
    // No job was sent but the two operations' own.
    const { rows: sent } = await admin.query(
      `SELECT name,data->>'operationId' AS "operationId"
       FROM ${queueSchema}.job WHERE created_on>=$1`,
      [since],
    )
    const operations = await pool.query(
      'SELECT id FROM ai_operations WHERE assignment_id=ANY($1::uuid[])',
      [[local.assignmentId, paid.assignmentId]],
    )
    type Sent = { name: string; operationId: string }
    expect(sent.map((job: Sent) => job.name).sort()).toEqual(
      [localTestJob.queue, paidTestJob.queue].sort(),
    )
    expect(sent.map((job: Sent) => job.operationId).sort()).toEqual(
      operations.rows.map((row: { id: string }) => row.id).sort(),
    )
  }, 120_000)

  it('carries out the next assignment of the paid executor after an operation of it ended uncertain (T4-AC03, T4-R04)', async () => {
    worker ??= await startWorker()
    const uncertain = await place('paid', 0, true)
    const next = await place('paid', 0)
    await waitFor(
      async () =>
        (await statusOf(uncertain.assignmentId)) === 'needs_attention',
      60_000,
      'the uncertain assignment to need attention',
    )
    const operations = await waitFor(
      async () => {
        const { rows } = await pool.query(
          'SELECT state FROM ai_operations WHERE assignment_id=$1',
          [next.assignmentId],
        )
        return rows[0]?.state === 'succeeded' && rows
      },
      60_000,
      'the next assignment to be carried out',
    )
    expect(operations).toEqual([{ state: 'succeeded' }])
    const { rows } = await pool.query(
      'SELECT state FROM ai_operations WHERE assignment_id=$1',
      [uncertain.assignmentId],
    )
    expect(rows).toEqual([{ state: 'uncertain' }])
  }, 120_000)

  it('ends a pending operation whose background work fails on every attempt before the start as an ordinary failure charging nothing, and adds the next operation (T4-AC05, T4-R06)', async () => {
    worker ??= await startWorker()
    // Every start of a paid operation fails while the month table is away.
    await pool.query('ALTER TABLE ai_budget_months RENAME TO months_away')
    try {
      const placed = await place('paid', 0)
      await waitFor(
        async () => (await statusOf(placed.assignmentId)) === 'needs_attention',
        90_000,
        'the assignment to need attention',
      )
      const { rows } = await pool.query(
        `SELECT ordinal,origin,state,waits_for,cause,retryable,
          potential_cost,actual_cost,budget_month,started_at
         FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal`,
        [placed.assignmentId],
      )
      const failed = {
        origin: 'automatic',
        state: 'failed',
        waits_for: null,
        cause: 'unknown',
        retryable: true,
        potential_cost: null,
        actual_cost: null,
        budget_month: null,
        started_at: null,
      }
      expect(rows).toEqual([1, 2, 3].map((ordinal) => ({ ordinal, ...failed })))
      const calls = await pool.query(
        'SELECT 1 FROM operation_calls WHERE tag=$1',
        [placed.tag],
      )
      expect(calls.rows).toEqual([])
    } finally {
      await pool.query('ALTER TABLE months_away RENAME TO ai_budget_months')
    }
  }, 120_000)

  describe('interrupted operations (T5)', () => {
    /** An executor call that does not return while the test runs. */
    const hangs = 600_000

    async function kill(child: ChildProcess) {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGKILL')
      await once(child, 'exit')
    }

    const callsOf = async (tag: string) =>
      (await pool.query('SELECT 1 FROM operation_calls WHERE tag=$1', [tag]))
        .rows.length

    const calledOnce = (tag: string) =>
      waitFor(
        async () => (await callsOf(tag)) === 1,
        60_000,
        'the executor to be called',
      )

    const needsAttention = (assignmentId: string, timeoutMs: number) =>
      waitFor(
        async () => (await statusOf(assignmentId)) === 'needs_attention',
        timeoutMs,
        'the assignment to need attention',
      )

    /** The interrupted operation is uncertain with its potential cost held. */
    async function expectUncertain(assignmentId: string, tag: string) {
      const { rows } = await pool.query(
        `SELECT state,cause,retryable,potential_cost,actual_cost,budget_month
         FROM ai_operations WHERE assignment_id=$1`,
        [assignmentId],
      )
      expect(rows).toMatchObject([
        {
          state: 'uncertain',
          cause: 'unknown',
          retryable: null,
          potential_cost: '0.008000',
          actual_cost: null,
        },
      ])
      expect(rows[0].budget_month).not.toBeNull()
      expect(await callsOf(tag)).toBe(1)
    }

    const attemptsOf = async (assignmentId: string) =>
      (
        await admin.query(
          `SELECT j.state,j.retry_count AS "retryCount"
           FROM ${queueSchema}.job j
           WHERE j.name=$1 AND j.data->>'operationId'=(
             SELECT o.id::text FROM ${schema}.ai_operations o
             WHERE o.assignment_id=$2)`,
          [paidTestJob.queue, assignmentId],
        )
      ).rows as { state: string; retryCount: number }[]

    it('ends an operation as uncertain with its potential cost charged, needing attention and calling the executor once, after the worker is killed during it (T5-AC01, T5-R01, T5-R02)', async () => {
      worker ??= await startWorker()
      const placed = await place('paid', hangs)
      await calledOnce(placed.tag)
      await kill(worker)
      worker = await startWorker()
      await needsAttention(placed.assignmentId, 120_000)
      await expectUncertain(placed.assignmentId, placed.tag)
    }, 240_000)

    it('ends an operation as uncertain with its potential cost charged, needing attention and calling the executor once, after it outlasts a short queue time limit (T5-AC01, T5-R01, T5-R02)', async () => {
      worker ??= await startWorker()
      const settings = { attempts: 2, retryDelaySeconds: 0 }
      // The time limit is set on a job when it is sent.
      await applyQueueConfiguration({
        [paidTestJob.queue]: { ...settings, timeLimitSeconds: 3 },
        [localTestJob.queue]: { ...settings, timeLimitSeconds: 60 },
      })
      try {
        const placed = await place('paid', hangs)
        await calledOnce(placed.tag)
        await needsAttention(placed.assignmentId, 60_000)
        await expectUncertain(placed.assignmentId, placed.tag)
      } finally {
        await applyQueueConfiguration({
          [paidTestJob.queue]: { ...settings, timeLimitSeconds: 60 },
          [localTestJob.queue]: { ...settings, timeLimitSeconds: 60 },
        })
      }
    }, 120_000)

    it('makes the delivery by the next attempt, without calling the executor again, after the worker is killed between the end of an operation with a result and its delivery (T6-AC08, T6-R10)', async () => {
      worker ??= await startWorker()
      const placed = await place('paid', 0, false, true)
      await waitFor(
        async () => (await receiverCallsOf(placed.assignmentId)).length === 1,
        60_000,
        'the delivery to begin',
      )
      const { rows } = await pool.query(
        'SELECT state FROM ai_operations WHERE assignment_id=$1',
        [placed.assignmentId],
      )
      expect(rows).toEqual([{ state: 'succeeded' }])
      expect(await statusOf(placed.assignmentId)).toBe('in_progress')
      await kill(worker)
      worker = await startWorker()
      await waitFor(
        async () => (await statusOf(placed.assignmentId)) === 'succeeded',
        180_000,
        'the assignment to succeed',
      )
      expect(await receiverSavesOf(placed.assignmentId)).toMatchObject([
        { entry: 'result' },
      ])
      expect(await receiverCallsOf(placed.assignmentId)).toEqual([
        'result',
        'result',
      ])
      expect(await callsOf(placed.tag)).toBe(1)
    }, 300_000)

    it('ends an operation as uncertain within five minutes of the kill, through the failure handler, after the worker is killed during the last attempt (T5-AC02, T5-R03)', async () => {
      worker ??= await startWorker()
      // The first start fails once, so the attempt that runs the operation
      // is the last of the job's two. A sequence is not rolled back.
      await pool.query(`
        CREATE SEQUENCE start_failures;
        CREATE FUNCTION fail_first_start() RETURNS trigger AS $$
        BEGIN
          IF OLD.state='pending' AND NEW.state='running'
            AND nextval('${schema}.start_failures')=1 THEN
            RAISE EXCEPTION 'The first start fails';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_first_start BEFORE UPDATE ON ai_operations
          FOR EACH ROW EXECUTE FUNCTION fail_first_start();`)
      try {
        const placed = await place('paid', hangs)
        await calledOnce(placed.tag)
        expect(await attemptsOf(placed.assignmentId)).toMatchObject([
          { state: 'active', retryCount: 1 },
        ])
        await kill(worker)
        const killedAt = Date.now()
        worker = await startWorker()
        await needsAttention(placed.assignmentId, 5 * 60_000)
        expect(Date.now() - killedAt).toBeLessThan(5 * 60_000)
        await expectUncertain(placed.assignmentId, placed.tag)
        expect(await attemptsOf(placed.assignmentId)).toMatchObject([
          { state: 'failed', retryCount: 1 },
        ])
      } finally {
        await pool.query(`
          DROP TRIGGER fail_first_start ON ai_operations;
          DROP FUNCTION fail_first_start();
          DROP SEQUENCE start_failures;`)
      }
    }, 420_000)
  })
})
