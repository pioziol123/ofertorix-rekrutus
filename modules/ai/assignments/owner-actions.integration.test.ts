import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
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
import { closePool, db, setPool, transaction } from '../../../lib/db.ts'
import {
  createQueue,
  defineJob,
  stopQueues,
} from '../../../lib/queues/index.ts'
import type {
  Executor,
  OperationJobData,
  ExecutorOutcome,
} from '../ports/executor.ts'
import type { PriceList } from '../domain/price-list.ts'
import { registerExecutor } from '../infrastructure/adapters/registry.ts'
import {
  failAssignmentsPastTimeLimit,
  placeAssignment,
  registerAssignmentReceiver,
  rejectAssignment,
  retryAssignment,
  runOperation,
  type AssignmentReceiver,
} from '../index.ts'
import { carryOutOperation } from './carry-out-operation.ts'
import { endOperation } from './end-operation.ts'
import { startOperation } from './start-operation.ts'

/**
 * T12 of epic sq2 (task oferty-pracy-sq2.13): the owner's Retry and Reject
 * on a real database, with a test executor that answers by script and a
 * test receiver that can raise on a failure.
 */

const settings = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('./assignment-settings.ts', () => ({ assignmentSettings: settings }))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** Potential cost 0.008 PLN; the usage below costs 0.000080 PLN. */
const priceList: PriceList = {
  model: 'cheap',
  version: 'prices-1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '2',
  usdPln: '4',
  fxVersion: 'fx-1',
  maxInputTokens: 1000,
  maxOutputTokens: 500,
}
const usage = { sent: true, inputTokens: 10, outputTokens: 5, toolCalls: 0 }
const result = (text = 'summary'): ExecutorOutcome => ({
  kind: 'result',
  content: { text },
  usage,
})
const ordinaryFailure: ExecutorOutcome = {
  kind: 'failed',
  cause: 'http',
  retryable: true,
  usage: { sent: true, inputTokens: null, outputTokens: null, toolCalls: 0 },
}

const job = defineJob<OperationJobData>({
  queue: 'owner-actions-test',
  key: { mode: 'exclusivity', value: 'owner-actions-test' },
})

/** What the executor answers next; a result when the script is empty. */
let answers: ExecutorOutcome[] = []
let calls = 0
const executor: Executor = {
  name: 'owner-actions-test',
  job,
  services: {
    single: {
      offers: [{ parameters: { model: 'cheap' }, priceList }],
      tools: [],
      maxRunSeconds: 60,
    },
  },
  configured: () => true,
  async carryOut() {
    calls++
    return answers.shift() ?? result()
  },
  materials: () => null,
}

/**
 * The test receiver: it saves one row per assignment and entry, so a
 * repeated call adds nothing (T6-R09), and it saves before it raises, so a
 * raise shows that its save was rolled back.
 */
let raiseOnFailure = false
const received: { entry: 'result' | 'failure'; assignmentId: string }[] = []
const testReceiver: AssignmentReceiver = {
  async receiveResult({ assignmentId }) {
    received.push({ entry: 'result', assignmentId })
    await db().query(
      `INSERT INTO receiver_saves(assignment_id,entry) VALUES($1,'result')
       ON CONFLICT DO NOTHING`,
      [assignmentId],
    )
  },
  async receiveFailure({ assignmentId }) {
    received.push({ entry: 'failure', assignmentId })
    await db().query(
      `INSERT INTO receiver_saves(assignment_id,entry) VALUES($1,'failure')
       ON CONFLICT DO NOTHING`,
      [assignmentId],
    )
    if (raiseOnFailure)
      throw new Error('The test receiver fails on the failure')
  },
}

/** An error log that keeps the messages of a test. */
const logged: string[] = []
const log = (message: string) => {
  logged.push(message)
}

integration("the owner's Retry and Reject on a real database (T12)", () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `ai_act_${suffix}`
  const queueSchema = `aiq_act_${suffix}`
  let previousQueueSchema: string | undefined
  let admin: Pool
  let pool: Pool

  const place = async () =>
    (
      await transaction(() =>
        placeAssignment({
          settingsName: 'acted',
          type: 'single',
          label: 'Offer 12',
          instruction: 'Summarise the text.',
          input: 'Some text',
          responseFormat: { name: 'summary', schema: { type: 'object' } },
        }),
      )
    ).assignmentId
  const operationsOf = async (assignmentId: string) =>
    (
      await pool.query(
        `SELECT id,ordinal,origin,state,waits_for,cause,retryable,
          potential_cost,actual_cost,budget_month,result,finished_at
         FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal`,
        [assignmentId],
      )
    ).rows
  const lastOperationId = async (assignmentId: string) =>
    (await operationsOf(assignmentId)).at(-1)!.id as string
  const assignmentOf = async (assignmentId: string) =>
    (
      await pool.query(
        `SELECT status,failure_reason,deadline,finished_at FROM ai_assignments
         WHERE id=$1`,
        [assignmentId],
      )
    ).rows[0] as {
      status: string
      failure_reason: string | null
      deadline: Date
      finished_at: Date | null
    }
  const savesOf = async (assignmentId: string) =>
    (
      await pool.query(
        `SELECT entry FROM receiver_saves WHERE assignment_id=$1 ORDER BY entry`,
        [assignmentId],
      )
    ).rows.map((row) => row.entry as string)
  const jobsOf = async (operationId: string) =>
    Number(
      (
        await admin.query(
          `SELECT count(*) FROM ${queueSchema}.job
           WHERE name=$1 AND data->>'operationId'=$2`,
          [job.queue, operationId],
        )
      ).rows[0].count,
    )
  /** Places an assignment and runs its operations until it needs attention. */
  const needingAttention = async () => {
    const assignmentId = await place()
    answers = [
      { ...ordinaryFailure, retryable: false, cause: 'context_overflow' },
    ]
    await runOperation({ operationId: await lastOperationId(assignmentId) })
    expect((await assignmentOf(assignmentId)).status).toBe('needs_attention')
    return assignmentId
  }
  /** Moves the assignment's deadline, and its placing, a day into the past. */
  const pastDeadline = (assignmentId: string) =>
    pool.query(
      `UPDATE ai_assignments SET placed_at=now()-interval '8 days',
        deadline=now()-interval '1 day' WHERE id=$1`,
      [assignmentId],
    )

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 6,
    })
    const sql: string[] = []
    for (const migration of [
      '1770000000004_profiles',
      '1770000000027_ai_assignments',
      '1770000000030_ai_operation_exchange',
      '1770000000031_ai_budget_default_limit',
      '1770000000035_ai_budget_carried_amounts',
    ])
      createRequire(import.meta.url)(`../../../migrations/${migration}.cjs`).up(
        { sql: (statement: string) => sql.push(statement) },
      )
    await pool.query(sql.join('\n'))
    await pool.query(`CREATE TABLE receiver_saves (
      assignment_id uuid NOT NULL, entry text NOT NULL,
      PRIMARY KEY(assignment_id, entry))`)
    setPool(pool)
    previousQueueSchema = process.env.PG_BOSS_SCHEMA
    process.env.PG_BOSS_SCHEMA = queueSchema
    await createQueue(job.queue, 'exclusivity')
    registerExecutor(executor)
    registerAssignmentReceiver('acted', testReceiver)
    Object.assign(settings, {
      acted: {
        executor: 'owner-actions-test',
        parameters: { model: 'cheap' },
        requestingModule: 'Tests',
      },
    })
  }, 30_000)

  afterAll(async () => {
    await stopQueues()
    await closePool()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
    await admin?.end()
  })

  beforeEach(async () => {
    answers = []
    calls = 0
    received.length = 0
    logged.length = 0
    raiseOnFailure = false
    await pool.query(
      `TRUNCATE receiver_saves, ai_operation_exchange, ai_operations,
        ai_assignments, ai_budget_months CASCADE`,
    )
    await pool.query('UPDATE ai_budget_default_limit SET limit_pln=100')
  })

  describe('Retry (T12-R01, T12-R02)', () => {
    it('adds one manual operation to an assignment needing attention, makes it in progress with the same time limit, and a result then ends it succeeded (T12-AC01)', async () => {
      const assignmentId = await needingAttention()
      const before = await assignmentOf(assignmentId)

      expect(await retryAssignment(assignmentId)).toEqual({
        changed: true,
        status: 'in_progress',
      })
      const after = await assignmentOf(assignmentId)
      expect(after.status).toBe('in_progress')
      expect(after.deadline).toEqual(before.deadline)
      const operations = await operationsOf(assignmentId)
      expect(operations).toMatchObject([
        { ordinal: 1, origin: 'automatic', state: 'failed' },
        {
          ordinal: 2,
          origin: 'manual',
          state: 'pending',
          waits_for: 'executor',
        },
      ])
      // Its job was sent in the same save.
      expect(await jobsOf(operations[1].id)).toBe(1)

      await runOperation({ operationId: operations[1].id })
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'succeeded',
      })
      expect(await operationsOf(assignmentId)).toHaveLength(2)
      expect(received).toEqual([{ entry: 'result', assignmentId }])
      expect(calls).toBe(2)
    })

    it('returns the assignment to needs attention with no further operation after an ordinary failure of the operation of a Retry (T12-AC02)', async () => {
      const assignmentId = await needingAttention()
      await retryAssignment(assignmentId)
      answers = [ordinaryFailure]
      await runOperation({ operationId: await lastOperationId(assignmentId) })

      expect((await assignmentOf(assignmentId)).status).toBe('needs_attention')
      expect(await operationsOf(assignmentId)).toMatchObject([
        { origin: 'automatic', state: 'failed' },
        { origin: 'manual', state: 'failed', retryable: true, cause: 'http' },
      ])
      expect(received).toEqual([])
    })

    it('changes nothing and returns the current status for an assignment in progress, a final one and one past its time limit (T12-AC04)', async () => {
      const inProgress = await place()
      expect(await retryAssignment(inProgress)).toEqual({
        changed: false,
        status: 'in_progress',
      })
      expect(await operationsOf(inProgress)).toHaveLength(1)

      const succeeded = await place()
      await runOperation({ operationId: await lastOperationId(succeeded) })
      expect(await retryAssignment(succeeded)).toEqual({
        changed: false,
        status: 'succeeded',
      })
      expect(await operationsOf(succeeded)).toHaveLength(1)

      const pastLimit = await needingAttention()
      await pastDeadline(pastLimit)
      expect(await retryAssignment(pastLimit)).toEqual({
        changed: false,
        status: 'needs_attention',
      })
      expect(await operationsOf(pastLimit)).toHaveLength(1)

      // A repeated Retry adds nothing more.
      const retried = await needingAttention()
      await retryAssignment(retried)
      expect(await retryAssignment(retried)).toEqual({
        changed: false,
        status: 'in_progress',
      })
      expect(await operationsOf(retried)).toHaveLength(2)
    })

    it('answers null for an unknown or malformed identifier', async () => {
      expect(await retryAssignment(randomUUID())).toBeNull()
      expect(await retryAssignment('nonsense')).toBeNull()
      expect(await rejectAssignment(randomUUID(), new Date(), log)).toBeNull()
      expect(await rejectAssignment('nonsense', new Date(), log)).toBeNull()
    })
  })

  describe('Reject (T12-R03, T12-R04, T12-R06)', () => {
    it('fails an assignment waiting for the budget with the reason "rejected", ends its pending operation as not started charging nothing, and gives its receiver the failure once in the same save (T12-AC03)', async () => {
      await pool.query(
        `INSERT INTO ai_budget_months(month,limit_pln)
         VALUES(to_char(now() AT TIME ZONE 'Europe/Warsaw','YYYY-MM'),0)`,
      )
      const assignmentId = await place()
      const operationId = await lastOperationId(assignmentId)
      expect(await startOperation(operationId)).toBe('waits_for_budget')

      expect(await rejectAssignment(assignmentId, new Date(), log)).toEqual({
        changed: true,
        status: 'failed',
      })
      const assignment = await assignmentOf(assignmentId)
      expect(assignment).toMatchObject({
        status: 'failed',
        failure_reason: 'rejected',
      })
      expect(assignment.finished_at).not.toBeNull()
      expect(await operationsOf(assignmentId)).toMatchObject([
        {
          state: 'failed',
          cause: 'not_started',
          waits_for: null,
          potential_cost: null,
          budget_month: null,
        },
      ])
      expect(received).toEqual([{ entry: 'failure', assignmentId }])
      expect(await savesOf(assignmentId)).toEqual(['failure'])
    })

    it('fails an assignment needing attention with its receiver given the failure once (T12-AC03)', async () => {
      const assignmentId = await needingAttention()
      expect(await rejectAssignment(assignmentId, new Date(), log)).toEqual({
        changed: true,
        status: 'failed',
      })
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'rejected',
      })
      expect(received).toEqual([{ entry: 'failure', assignmentId }])
      expect(await savesOf(assignmentId)).toEqual(['failure'])
    })

    it('fails an assignment at once while its operation runs; the later result is settled, kept with the operation and not delivered (T12-AC03)', async () => {
      const assignmentId = await place()
      const operationId = await lastOperationId(assignmentId)
      expect(await startOperation(operationId)).toBe('started')

      expect(await rejectAssignment(assignmentId, new Date(), log)).toEqual({
        changed: true,
        status: 'failed',
      })
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'rejected',
      })
      expect((await operationsOf(assignmentId))[0].state).toBe('running')

      // The running operation goes on and ends with its result.
      const outcome = await carryOutOperation(operationId)
      expect(await endOperation(operationId, outcome!)).toBe(true)
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'rejected',
      })
      expect(await operationsOf(assignmentId)).toMatchObject([
        {
          state: 'succeeded',
          result: { text: 'summary' },
          potential_cost: '0.008000',
          actual_cost: '0.000080',
        },
      ])
      // A later attempt of its job delivers nothing either.
      await runOperation({ operationId })
      expect(received).toEqual([{ entry: 'failure', assignmentId }])
      expect(await savesOf(assignmentId)).toEqual(['failure'])
    })

    it('changes nothing on a second Reject and returns the current status (T12-AC04)', async () => {
      const assignmentId = await needingAttention()
      await rejectAssignment(assignmentId, new Date(), log)
      const finishedAt = (await assignmentOf(assignmentId)).finished_at
      expect(await rejectAssignment(assignmentId, new Date(), log)).toEqual({
        changed: false,
        status: 'failed',
      })
      expect((await assignmentOf(assignmentId)).finished_at).toEqual(finishedAt)
      expect(received).toHaveLength(1)

      const succeeded = await place()
      await runOperation({ operationId: await lastOperationId(succeeded) })
      expect(await rejectAssignment(succeeded, new Date(), log)).toEqual({
        changed: false,
        status: 'succeeded',
      })
    })

    it('fails the assignment once with one delivery when two Rejects are sent together (T12-AC04)', async () => {
      const assignmentId = await needingAttention()
      const outcomes = await Promise.all([
        rejectAssignment(assignmentId, new Date(), log),
        rejectAssignment(assignmentId, new Date(), log),
      ])
      expect(outcomes.map((outcome) => outcome?.changed).sort()).toEqual([
        false,
        true,
      ])
      expect(outcomes.map((outcome) => outcome?.status)).toEqual([
        'failed',
        'failed',
      ])
      expect(received).toEqual([{ entry: 'failure', assignmentId }])
      expect(await savesOf(assignmentId)).toEqual(['failure'])
    })

    it('leaves the assignment and its operations as they were and returns an error when the receiver raises on the failure; once it works, Reject fails the assignment (T12-AC06)', async () => {
      await pool.query(
        `INSERT INTO ai_budget_months(month,limit_pln)
         VALUES(to_char(now() AT TIME ZONE 'Europe/Warsaw','YYYY-MM'),0)`,
      )
      const assignmentId = await place()
      await startOperation(await lastOperationId(assignmentId))
      const assignmentBefore = await assignmentOf(assignmentId)
      const operationsBefore = await operationsOf(assignmentId)
      expect(operationsBefore).toMatchObject([
        { state: 'pending', waits_for: 'budget' },
      ])

      raiseOnFailure = true
      await expect(
        rejectAssignment(assignmentId, new Date(), log),
      ).rejects.toThrow('The test receiver fails on the failure')
      expect(await assignmentOf(assignmentId)).toEqual(assignmentBefore)
      expect(await operationsOf(assignmentId)).toEqual(operationsBefore)
      expect(await savesOf(assignmentId)).toEqual([])
      expect(logged).toEqual([
        expect.stringContaining(`assignment ${assignmentId}`),
      ])

      raiseOnFailure = false
      expect(await rejectAssignment(assignmentId, new Date(), log)).toEqual({
        changed: true,
        status: 'failed',
      })
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'rejected',
      })
      expect(await operationsOf(assignmentId)).toMatchObject([
        { state: 'failed', cause: 'not_started' },
      ])
      expect(await savesOf(assignmentId)).toEqual(['failure'])
    })

    it('leaves a rejected assignment to the time limit as it is', async () => {
      const assignmentId = await needingAttention()
      await rejectAssignment(assignmentId, new Date(), log)
      await pastDeadline(assignmentId)
      expect(await failAssignmentsPastTimeLimit(new Date(), log)).toEqual([])
      expect(await assignmentOf(assignmentId)).toMatchObject({
        failure_reason: 'rejected',
      })
    })
  })
})
