import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
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
import { closePool, db, setPool, transaction } from '../../../lib/db.ts'
import {
  createQueue,
  defineJob,
  stopQueues,
} from '../../../lib/queues/index.ts'
import { runPass } from '../../../periodic/pass.ts'
import { periodicSteps } from '../../../periodic/steps.ts'
import { budgetMonth } from '../domain/cost.ts'
import type {
  Executor,
  OperationJobData,
  OperationWork,
  PriceList,
} from '../executors/declaration.ts'
import type { ExecutorOutcome } from '../executors/outcome.ts'
import { registerExecutor } from '../executors/registry.ts'
import {
  endFailedOperation,
  placeAssignment,
  readMonthlyBudgets,
  registerAssignmentReceiver,
  runOperation,
  type AssignmentReceiver,
  type AssignmentRequest,
} from '../index.ts'
import type { AgentMaterial } from '../provider-adapter.ts'
import { endOperation } from './end-operation.ts'
import { readAssignmentCost } from './read-assignment-cost.ts'
import { startOperation } from './start-operation.ts'

/**
 * T6 of epic sq2: the delivery of an assignment's end through its
 * requesting module's receiver and the time limit, on a real database with
 * a test executor and test receivers. Delivery through the worker, beside
 * the other executor's operation and after a kill, is in
 * tests/ai-operations.integration.test.ts.
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
const materials: AgentMaterial[] = [
  {
    id: 1,
    text: 'A gathered fact',
    sources: [
      {
        url: 'https://example.com/a',
        title: 'A',
        kind: 'page',
        accessedAt: '2026-11-21T10:00:00Z',
      },
    ],
  },
]

const job = defineJob<OperationJobData>({
  queue: 'delivery-test',
  key: { mode: 'exclusivity', value: 'delivery-test' },
})

/** What the executor answers next, and the work it was given. */
let answers: ExecutorOutcome[] = []
const calls: OperationWork[] = []
const executor: Executor = {
  name: 'delivery-test',
  job,
  services: {
    single: {
      offers: [{ parameters: { model: 'cheap' }, priceList }],
      tools: [],
      maxRunSeconds: 60,
    },
    agent: {
      offers: [{ parameters: { model: 'cheap' }, priceList }],
      tools: ['web_search'],
      maxRunSeconds: 60,
    },
  },
  configured: () => true,
  async carryOut(work) {
    calls.push(work)
    // An agent session keeps its materials in its executor state.
    if (work.content.type === 'agent') await work.saveState({ materials })
    return (
      answers.shift() ?? { kind: 'result', content: { text: 'summary' }, usage }
    )
  },
  materials: (state) =>
    (state as { materials?: AgentMaterial[] } | null)?.materials ?? null,
}

/**
 * The test receiver of the settings `received`. It follows the three rules
 * of the receiver (T6-R09): it saves its row once per assignment and entry,
 * so a repeated call adds nothing; it uses only its arguments. It saves
 * before it raises, so a raise shows that its save was rolled back.
 */
type ReceiverMode = 'accept' | 'raise_on_result' | 'raise_on_failure'
let receiverMode: ReceiverMode = 'accept'
const received: { entry: 'result' | 'failure'; delivery: unknown }[] = []
const testReceiver: AssignmentReceiver = {
  async receiveResult(delivery) {
    received.push({ entry: 'result', delivery })
    await db().query(
      `INSERT INTO receiver_saves(assignment_id,entry,content)
       VALUES($1,'result',$2) ON CONFLICT DO NOTHING`,
      [
        delivery.assignmentId,
        JSON.stringify({
          result: delivery.result,
          materials: delivery.materials ?? null,
        }),
      ],
    )
    if (receiverMode === 'raise_on_result')
      throw new Error('The test receiver does not take the result')
  },
  async receiveFailure(delivery) {
    received.push({ entry: 'failure', delivery })
    await db().query(
      `INSERT INTO receiver_saves(assignment_id,entry) VALUES($1,'failure')
       ON CONFLICT DO NOTHING`,
      [delivery.assignmentId],
    )
    if (receiverMode === 'raise_on_failure')
      throw new Error('The test receiver fails on the failure')
  },
}

const request = (
  settingsName: string,
  type: 'single' | 'agent' = 'single',
): AssignmentRequest =>
  type === 'single'
    ? {
        settingsName,
        type,
        label: 'Offer 12',
        instruction: 'Summarise the text.',
        input: 'Some text',
        responseFormat: { name: 'summary', schema: { type: 'object' } },
      }
    : {
        settingsName,
        type,
        label: 'Company 7',
        instruction: 'Research the company.',
        input: 'Example Ltd',
        responseFormat: { name: 'research', schema: { type: 'object' } },
        agent: {
          tools: ['web_search'],
          resultInstruction: 'Write the research.',
        },
      }

/** A step's error fails the test instead of being logged. */
const fail = (message: string) => {
  throw new Error(message)
}

const timeLimitStep = periodicSteps.find(
  (step) => step.name === 'fail AI assignments past their time limit',
)!

integration('delivery and the time limit on a real database', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `ai_dlv_${suffix}`
  const queueSchema = `aiq_dlv_${suffix}`
  let previousQueueSchema: string | undefined
  let admin: Pool
  let pool: Pool

  const place = async (
    settingsName = 'received',
    type: 'single' | 'agent' = 'single',
  ) =>
    (await transaction(() => placeAssignment(request(settingsName, type))))
      .assignmentId
  const operationsOf = async (assignmentId: string) =>
    (
      await pool.query(
        `SELECT id,ordinal,state,waits_for,cause,retryable,potential_cost,
          actual_cost,budget_month
         FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal`,
        [assignmentId],
      )
    ).rows
  const operationIdOf = async (assignmentId: string) =>
    (await operationsOf(assignmentId))[0].id as string
  const assignmentOf = async (assignmentId: string) =>
    (
      await pool.query(
        `SELECT status,failure_reason,finished_at FROM ai_assignments
         WHERE id=$1`,
        [assignmentId],
      )
    ).rows[0] as {
      status: string
      failure_reason: string | null
      finished_at: Date | null
    }
  const savesOf = async (assignmentId: string) =>
    (
      await pool.query(
        `SELECT entry,content FROM receiver_saves WHERE assignment_id=$1
         ORDER BY entry`,
        [assignmentId],
      )
    ).rows
  const receivedFor = (assignmentId: string) =>
    received.filter(
      (call) =>
        (call.delivery as { assignmentId: string }).assignmentId ===
        assignmentId,
    )
  /** Moves the assignment's deadline, and its placing, a day into the past. */
  const pastDeadline = (assignmentId: string) =>
    pool.query(
      `UPDATE ai_assignments SET placed_at=now()-interval '8 days',
        deadline=now()-interval '1 day' WHERE id=$1`,
      [assignmentId],
    )
  const setLimit = (month: string, limit: string) =>
    pool.query(
      `INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,$2)
       ON CONFLICT(month) DO UPDATE SET limit_pln=$2`,
      [month, limit],
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
    ])
      createRequire(import.meta.url)(`../../../migrations/${migration}.cjs`).up(
        { sql: (statement: string) => sql.push(statement) },
      )
    await pool.query(sql.join('\n'))
    await pool.query(`CREATE TABLE receiver_saves (
      assignment_id uuid NOT NULL, entry text NOT NULL, content jsonb,
      PRIMARY KEY(assignment_id, entry))`)
    setPool(pool)
    previousQueueSchema = process.env.PG_BOSS_SCHEMA
    process.env.PG_BOSS_SCHEMA = queueSchema
    await createQueue(job.queue, 'exclusivity')
    registerExecutor(executor)
    registerAssignmentReceiver('received', testReceiver)
    const entry = {
      executor: 'delivery-test',
      parameters: { model: 'cheap' },
      requestingModule: 'Tests',
    }
    // `unreceived` has no receiver registered.
    Object.assign(settings, { received: entry, unreceived: entry })
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
    calls.length = 0
    received.length = 0
    receiverMode = 'accept'
    await pool.query(
      `TRUNCATE receiver_saves, ai_operation_exchange, ai_operations,
        ai_assignments, ai_budget_months CASCADE`,
    )
    await pool.query('UPDATE ai_budget_default_limit SET limit_pln=100')
    await admin.query(`DELETE FROM ${queueSchema}.job WHERE name=$1`, [
      job.queue,
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('delivery of a result (T6-R01–T6-R04)', () => {
    it('ends an assignment succeeded after its operation returns a result, calling its receiver once with the result, the receiver saves in the same save (T6-AC01)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await runOperation({ operationId })
      const assignment = await assignmentOf(assignmentId)
      expect(assignment).toMatchObject({
        status: 'succeeded',
        failure_reason: null,
      })
      expect(assignment.finished_at).not.toBeNull()
      expect(received).toEqual([
        {
          entry: 'result',
          delivery: { assignmentId, result: { text: 'summary' } },
        },
      ])
      expect(await savesOf(assignmentId)).toEqual([
        {
          entry: 'result',
          content: { result: { text: 'summary' }, materials: null },
        },
      ])
      // A repeated job delivers nothing more and calls no executor.
      await runOperation({ operationId })
      await endFailedOperation({ operationId })
      expect(received).toHaveLength(1)
      expect(calls).toHaveLength(1)
    })

    it("delivers an agent's result with the materials of its session (T6-AC01)", async () => {
      const assignmentId = await place('received', 'agent')
      await runOperation({ operationId: await operationIdOf(assignmentId) })
      expect((await assignmentOf(assignmentId)).status).toBe('succeeded')
      expect(received).toEqual([
        {
          entry: 'result',
          delivery: { assignmentId, result: { text: 'summary' }, materials },
        },
      ])
      expect(await savesOf(assignmentId)).toEqual([
        {
          entry: 'result',
          content: { result: { text: 'summary' }, materials },
        },
      ])
    })

    it('fails the assignment as "result not taken" when its receiver raises an error on the result: none of the result call\'s saves remain, the failure entry was called and saved, and the cost stays as settled (T6-AC02)', async () => {
      receiverMode = 'raise_on_result'
      const assignmentId = await place()
      await runOperation({ operationId: await operationIdOf(assignmentId) })
      const assignment = await assignmentOf(assignmentId)
      expect(assignment).toMatchObject({
        status: 'failed',
        failure_reason: 'delivery_failed',
      })
      expect(assignment.finished_at).not.toBeNull()
      expect(received.map((call) => call.entry)).toEqual(['result', 'failure'])
      expect(received[1]!.delivery).toEqual({ assignmentId })
      expect(await savesOf(assignmentId)).toEqual([
        { entry: 'failure', content: null },
      ])
      expect(await operationsOf(assignmentId)).toMatchObject([
        {
          state: 'succeeded',
          potential_cost: '0.008000',
          actual_cost: '0.000080',
        },
      ])
      expect(await readMonthlyBudgets()).toMatchObject([
        { settled: '0.000080', held: '0.000000' },
      ])
    })

    it('fails the assignment as "result not taken" when no receiver is provided for its settings (T6-AC02)', async () => {
      const assignmentId = await place('unreceived')
      await runOperation({ operationId: await operationIdOf(assignmentId) })
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'delivery_failed',
      })
      expect(await operationsOf(assignmentId)).toMatchObject([
        { state: 'succeeded', actual_cost: '0.000080' },
      ])
    })

    it('leaves the assignment in progress when its receiver also raises an error on the failure; the attempt fails and the next one, once the receiver works, makes the delivery from its beginning without calling the executor (T6-R05, T6-R10)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      // It raises on the result once, and on the failure while it fails.
      receiverMode = 'raise_on_failure'
      testReceiverRaisesOnResultOnce()
      await expect(runOperation({ operationId })).rejects.toThrow(
        /fails on the failure/,
      )
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'in_progress',
      })
      expect(await savesOf(assignmentId)).toEqual([])
      receiverMode = 'accept'
      await runOperation({ operationId })
      expect((await assignmentOf(assignmentId)).status).toBe('succeeded')
      expect(await savesOf(assignmentId)).toMatchObject([{ entry: 'result' }])
      expect(calls).toHaveLength(1)
    })

    /**
     * The next result call raises as `raise_on_result` would; later calls
     * follow the mode.
     */
    function testReceiverRaisesOnResultOnce() {
      const original = testReceiver.receiveResult
      vi.spyOn(testReceiver, 'receiveResult').mockImplementationOnce(
        async (delivery) => {
          await original.call(testReceiver, delivery)
          throw new Error('The test receiver does not take the result')
        },
      )
    }

    it('makes the delivery when a later attempt finds the operation succeeded with its assignment in progress, without calling the executor (T6-R10)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      // The attempt that ended the operation stopped before its delivery.
      await startOperation(operationId)
      await endOperation(operationId, {
        kind: 'result',
        content: { text: 'kept' },
        usage,
      })
      expect((await assignmentOf(assignmentId)).status).toBe('in_progress')
      await runOperation({ operationId })
      expect((await assignmentOf(assignmentId)).status).toBe('succeeded')
      expect(received).toEqual([
        {
          entry: 'result',
          delivery: { assignmentId, result: { text: 'kept' } },
        },
      ])
      expect(calls).toHaveLength(0)
    })

    it('after the last attempt failed in the delivery, the failure handler changes nothing and the time limit leaves the assignment alone (T6-R07)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await startOperation(operationId)
      await endOperation(operationId, { kind: 'result', content: {}, usage })
      await endFailedOperation({ operationId })
      await pastDeadline(assignmentId)
      await runPass([timeLimitStep], fail)
      expect((await assignmentOf(assignmentId)).status).toBe('in_progress')
      expect(await operationsOf(assignmentId)).toMatchObject([
        { state: 'succeeded' },
      ])
      expect(received).toEqual([])
    })

    it('delivers nothing for an assignment no longer in progress', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await startOperation(operationId)
      await pool.query(
        `UPDATE ai_assignments SET status='failed',failure_reason='rejected'
         WHERE id=$1`,
        [assignmentId],
      )
      await runOperation({ operationId })
      expect(received).toEqual([])
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'rejected',
      })
    })
  })

  describe('the time limit (T6-R05–T6-R08)', () => {
    it("keeps an assignment past its time limit as it was when its receiver raises an error on the failure, logging the error; once the receiver works, the next pass fails it with the receiver's saves (T6-AC03)", async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await pastDeadline(assignmentId)
      receiverMode = 'raise_on_failure'
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      await runPass([timeLimitStep], fail)
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'in_progress',
        failure_reason: null,
      })
      expect(await operationsOf(assignmentId)).toMatchObject([
        { state: 'pending', waits_for: 'executor' },
      ])
      expect(await savesOf(assignmentId)).toEqual([])
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          `assignment ${assignmentId}: The test receiver fails on the failure`,
        ),
      )
      log.mockClear()
      receiverMode = 'accept'
      await runPass([timeLimitStep], fail)
      expect(log).not.toHaveBeenCalled()
      expect(await assignmentOf(assignmentId)).toMatchObject({
        status: 'failed',
        failure_reason: 'time_limit',
      })
      expect(await savesOf(assignmentId)).toEqual([
        { entry: 'failure', content: null },
      ])
      // Its job then finds nothing to start.
      await runOperation({ operationId })
      expect(calls).toHaveLength(0)
    })

    it('fails an assignment waiting for the budget and one needing attention past their time limit, telling their receivers with no reason, their pending operations charging nothing, and leaves one not yet past the limit (T6-AC04, T6-R06, T6-R07)', async () => {
      const month = budgetMonth(new Date())
      await setLimit(month, '0')
      const waiting = await place()
      await runOperation({ operationId: await operationIdOf(waiting) })
      expect(await operationsOf(waiting)).toMatchObject([
        { state: 'pending', waits_for: 'budget' },
      ])
      await setLimit(month, '100')
      answers = [{ kind: 'uncertain', cause: 'network', usage }]
      const attention = await place()
      await runOperation({ operationId: await operationIdOf(attention) })
      expect((await assignmentOf(attention)).status).toBe('needs_attention')
      const notYet = await place()
      await pastDeadline(waiting)
      await pastDeadline(attention)

      await runPass([timeLimitStep], fail)

      for (const assignmentId of [waiting, attention]) {
        const assignment = await assignmentOf(assignmentId)
        expect(assignment).toMatchObject({
          status: 'failed',
          failure_reason: 'time_limit',
        })
        expect(assignment.finished_at).not.toBeNull()
        expect(receivedFor(assignmentId)).toEqual([
          { entry: 'failure', delivery: { assignmentId } },
        ])
        expect(await savesOf(assignmentId)).toEqual([
          { entry: 'failure', content: null },
        ])
      }
      expect(await operationsOf(waiting)).toMatchObject([
        {
          state: 'failed',
          waits_for: null,
          cause: 'not_started',
          retryable: false,
          potential_cost: null,
          budget_month: null,
        },
      ])
      expect((await readAssignmentCost(waiting)).charge).toBe('0.000000')
      expect(await assignmentOf(notYet)).toMatchObject({
        status: 'in_progress',
      })
      expect(await operationsOf(notYet)).toMatchObject([
        { state: 'pending', waits_for: 'executor' },
      ])
      expect(receivedFor(notYet)).toEqual([])
      // A failed assignment is not taken again.
      await runPass([timeLimitStep], fail)
      expect(received).toHaveLength(2)
    })

    it('leaves alone, past the limit, an assignment with a running operation and one in progress with an operation ended with a result (T6-AC05, T6-R07)', async () => {
      const running = await place()
      await startOperation(await operationIdOf(running))
      const delivered = await place()
      const deliveredOperation = await operationIdOf(delivered)
      await startOperation(deliveredOperation)
      await endOperation(deliveredOperation, {
        kind: 'result',
        content: {},
        usage,
      })
      await pastDeadline(running)
      await pastDeadline(delivered)
      await runPass([timeLimitStep], fail)
      expect(await assignmentOf(running)).toMatchObject({
        status: 'in_progress',
      })
      expect(await operationsOf(running)).toMatchObject([{ state: 'running' }])
      expect(await assignmentOf(delivered)).toMatchObject({
        status: 'in_progress',
      })
      expect(await operationsOf(delivered)).toMatchObject([
        { state: 'succeeded' },
      ])
      expect(received).toEqual([])
    })

    describe('an operation running past the limit (T6-AC06, T6-R08)', () => {
      it('gives a succeeded assignment when it ends with a result', async () => {
        const assignmentId = await place()
        const operationId = await operationIdOf(assignmentId)
        await startOperation(operationId)
        await pastDeadline(assignmentId)
        await runPass([timeLimitStep], fail)
        await endOperation(operationId, {
          kind: 'result',
          content: { text: 'late' },
          usage,
        })
        await runOperation({ operationId })
        expect(await assignmentOf(assignmentId)).toMatchObject({
          status: 'succeeded',
        })
        expect(received).toEqual([
          {
            entry: 'result',
            delivery: { assignmentId, result: { text: 'late' } },
          },
        ])
      })

      it('gives no new operation after an ordinary failure, and a failed assignment with the reason "time limit exceeded" after a pass', async () => {
        const assignmentId = await place()
        // A controlled clock: the operation ends eight days after placing.
        const later = new Date(Date.now() + 8 * 24 * 3600_000)
        answers = [{ kind: 'failed', retryable: true, cause: 'http', usage }]
        await runOperation(
          { operationId: await operationIdOf(assignmentId) },
          () => later,
        )
        expect(await operationsOf(assignmentId)).toMatchObject([
          { ordinal: 1, state: 'failed', retryable: true },
        ])
        expect((await assignmentOf(assignmentId)).status).toBe(
          'needs_attention',
        )
        await pastDeadline(assignmentId)
        await runPass([timeLimitStep], fail)
        expect(await assignmentOf(assignmentId)).toMatchObject({
          status: 'failed',
          failure_reason: 'time_limit',
        })
        expect(receivedFor(assignmentId)).toEqual([
          { entry: 'failure', delivery: { assignmentId } },
        ])
      })

      it('still adds the next operation after an ordinary failure before the deadline (T4-R02)', async () => {
        const assignmentId = await place()
        answers = [{ kind: 'failed', retryable: true, cause: 'http', usage }]
        await runOperation({ operationId: await operationIdOf(assignmentId) })
        expect(await operationsOf(assignmentId)).toMatchObject([
          { ordinal: 1, state: 'failed' },
          { ordinal: 2, state: 'pending', waits_for: 'executor' },
        ])
      })
    })
  })

  describe("the receiver's rules (T6-AC07, T6-R09)", () => {
    it('leaves the same data after a receiver that follows them is called twice with the same result and twice with the same failure as after one call', async () => {
      const assignmentId = randomUUID()
      const snapshot = async () =>
        (
          await pool.query(
            'SELECT assignment_id,entry,content FROM receiver_saves ORDER BY entry',
          )
        ).rows
      const result = { assignmentId, result: { text: 'summary' } }
      await transaction(() => testReceiver.receiveResult(result))
      await transaction(() => testReceiver.receiveFailure({ assignmentId }))
      const once = await snapshot()
      expect(once).toHaveLength(2)
      await transaction(() => testReceiver.receiveResult(result))
      await transaction(() => testReceiver.receiveFailure({ assignmentId }))
      expect(await snapshot()).toEqual(once)
    })
  })
})
