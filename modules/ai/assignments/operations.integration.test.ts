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
import { closePool, setPool, transaction } from '../../../lib/db.ts'
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
  ExecutorOutcome,
} from '../ports/executor.ts'
import type { PriceList } from '../domain/price-list.ts'
import { nothingSent, unknownUsage } from '../domain/usage.ts'
import { registerExecutor } from '../infrastructure/adapters/registry.ts'
import {
  endFailedOperation,
  placeAssignment,
  readMonthlyBudgets,
  registerAssignmentReceiver,
  runOperation,
  type AssignmentRequest,
} from '../index.ts'
import { endOperation } from './end-operation.ts'
import { readAssignmentCost } from './read-assignment-cost.ts'
import { startOperation } from './start-operation.ts'

/**
 * T3 of epic sq2: operations start within the budget, end in one save and
 * are sent again when the budget gets room, on a real database with test
 * executors. One at a time per executor through the worker is in
 * tests/ai-operations.integration.test.ts.
 */

const settings = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('./assignment-settings.ts', () => ({ assignmentSettings: settings }))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/**
 * Potential cost: (1000 * 1 + 500 * 2) / 1e6 USD * 4 = 0.008 PLN. The
 * usage of 10 input and 5 output tokens costs 0.000080 PLN.
 */
const cheap: PriceList = {
  model: 'cheap',
  version: 'prices-1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '2',
  usdPln: '4',
  fxVersion: 'fx-1',
  maxInputTokens: 1000,
  maxOutputTokens: 500,
}
/** Potential cost 0.016 PLN. */
const dear: PriceList = { ...cheap, model: 'dear', usdPln: '8' }

const usage = {
  sent: true,
  inputTokens: 10,
  outputTokens: 5,
  toolCalls: 0,
}

const paidJob = defineJob<OperationJobData>({
  queue: 'op-test-paid',
  key: { mode: 'exclusivity', value: 'op-test-paid' },
})
const freeJob = defineJob<OperationJobData>({
  queue: 'op-test-free',
  key: { mode: 'exclusivity', value: 'op-test-free' },
})

/** What the executors answer next, and the work each was given. */
let answers: ExecutorOutcome[] = []
const calls: OperationWork[] = []
const carryOut = (work: OperationWork): Promise<ExecutorOutcome> => {
  calls.push(work)
  return Promise.resolve(
    answers.shift() ?? { kind: 'result', content: { ok: true }, usage },
  )
}

const paidExecutor = (prices = { cheap, dear }): Executor => ({
  name: 'test-paid',
  job: paidJob,
  services: {
    single: {
      offers: [
        { parameters: { model: 'cheap' }, priceList: prices.cheap },
        { parameters: { model: 'dear' }, priceList: prices.dear },
      ],
      tools: [],
      maxRunSeconds: 60,
    },
  },
  configured: () => true,
  carryOut,
  materials: () => null,
})
const freeExecutor: Executor = {
  name: 'test-free',
  job: freeJob,
  services: {
    single: {
      offers: [{ parameters: { model: 'local' }, priceList: null }],
      tools: [],
      maxRunSeconds: 60,
    },
  },
  configured: () => true,
  carryOut,
  materials: () => null,
}

const request = (settingsName: string): AssignmentRequest => ({
  settingsName,
  type: 'single',
  label: 'Offer 12',
  instruction: 'Summarise the text.',
  input: 'Some text',
  responseFormat: { name: 'summary', schema: { type: 'object' } },
})

/** 23:59:59 of 30 November 2026 in Polish time (UTC+1). */
const lastSecondOfNovember = new Date('2026-11-30T22:59:59Z')
const firstOfDecember = new Date('2026-12-01T00:30:00Z')

/** A step's error fails the test instead of being logged. */
const fail = (message: string) => {
  throw new Error(message)
}

integration('starting and ending operations on a real database', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `ai_ops_${suffix}`
  const queueSchema = `aiq_ops_${suffix}`
  let previousQueueSchema: string | undefined
  let admin: Pool
  let pool: Pool
  let migratedDefault: string

  const operationOf = async (assignmentId: string) =>
    (
      await pool.query(
        'SELECT * FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal',
        [assignmentId],
      )
    ).rows[0]
  const operationIdOf = async (assignmentId: string) =>
    (await operationOf(assignmentId)).id as string
  const jobs = async () =>
    (
      await admin.query(
        `SELECT name,data->>'operationId' AS "operationId"
         FROM ${queueSchema}.job WHERE name=ANY($1::text[])
         ORDER BY created_on,id`,
        [[paidJob.queue, freeJob.queue]],
      )
    ).rows as { name: string; operationId: string }[]
  const place = async (settingsName = 'cheap') =>
    (await transaction(() => placeAssignment(request(settingsName))))
      .assignmentId
  const setLimit = (month: string, limit: string) =>
    pool.query(
      `INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,$2)
       ON CONFLICT(month) DO UPDATE SET limit_pln=$2`,
      [month, limit],
    )
  const budgetStep = periodicSteps.find(
    (step) => step.name === 'send AI operations waiting for budget',
  )!

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
    migratedDefault = (
      await pool.query('SELECT limit_pln FROM ai_budget_default_limit')
    ).rows[0].limit_pln
    setPool(pool)
    previousQueueSchema = process.env.PG_BOSS_SCHEMA
    process.env.PG_BOSS_SCHEMA = queueSchema
    await createQueue(paidJob.queue, 'exclusivity')
    await createQueue(freeJob.queue, 'exclusivity')
    // A receiver that takes every end, so a result succeeds; the delivery
    // itself is tested in delivery.integration.test.ts (T6).
    for (const name of ['cheap', 'dear', 'free'])
      registerAssignmentReceiver(name, {
        receiveResult: () => Promise.resolve(),
        receiveFailure: () => Promise.resolve(),
      })
    Object.assign(settings, {
      cheap: {
        executor: 'test-paid',
        parameters: { model: 'cheap' },
        requestingModule: 'Tests',
      },
      dear: {
        executor: 'test-paid',
        parameters: { model: 'dear' },
        requestingModule: 'Tests',
      },
      free: {
        executor: 'test-free',
        parameters: { model: 'local' },
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
    calls.length = 0
    registerExecutor(paidExecutor())
    registerExecutor(freeExecutor)
    await pool.query(
      `TRUNCATE ai_operation_exchange, ai_operations, ai_assignments,
        ai_budget_months CASCADE`,
    )
    await pool.query('UPDATE ai_budget_default_limit SET limit_pln=100')
    await admin.query(
      `DELETE FROM ${queueSchema}.job WHERE name=ANY($1::text[])`,
      [[paidJob.queue, freeJob.queue]],
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('budget at the start (T3-R02)', () => {
    it('starts an operation with its potential cost charged to the current month and the price list used (T3-AC02)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      expect(await startOperation(operationId)).toBe('started')
      expect(await operationOf(assignmentId)).toMatchObject({
        state: 'running',
        waits_for: null,
        potential_cost: '0.008000',
        actual_cost: null,
        budget_month: budgetMonth(new Date()),
        price_list: cheap,
      })
      expect(await readMonthlyBudgets()).toEqual([
        {
          month: budgetMonth(new Date()),
          limit: '100.000000',
          settled: '0.000000',
          held: '0.008000',
          charge: '0.008000',
        },
      ])
    })

    it('with room for one, of two operations starting together leaves one running and one waiting for the budget (T3-AC02)', async () => {
      await setLimit(budgetMonth(new Date()), '0.010000')
      const operations = [
        await operationIdOf(await place()),
        await operationIdOf(await place()),
      ]
      // Another start holds the month's row: both starts wait for it, so
      // neither checks the room before the other's charge is saved.
      const holder = await pool.connect()
      await holder.query('BEGIN')
      await holder.query(
        'SELECT 1 FROM ai_budget_months WHERE month=$1 FOR UPDATE',
        [budgetMonth(new Date())],
      )
      const starts = Promise.all(operations.map((id) => startOperation(id)))
      await new Promise((resolve) => setTimeout(resolve, 300))
      const { rows: meanwhile } = await pool.query(
        "SELECT count(*)::int AS n FROM ai_operations WHERE state='running'",
      )
      await holder.query('COMMIT')
      holder.release()
      const outcomes = await starts
      expect(meanwhile[0].n).toBe(0)
      expect([...outcomes].sort()).toEqual(['started', 'waits_for_budget'])
      const { rows } = await pool.query(
        `SELECT state,waits_for,potential_cost,budget_month FROM ai_operations
         ORDER BY state`,
      )
      expect(rows).toEqual([
        {
          state: 'pending',
          waits_for: 'budget',
          potential_cost: null,
          budget_month: null,
        },
        {
          state: 'running',
          waits_for: null,
          potential_cost: '0.008000',
          budget_month: budgetMonth(new Date()),
        },
      ])
    })

    it('keeps the costs of a started operation when the price list changes after the start (T3-AC02)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await startOperation(operationId)
      const doubled = { ...cheap, version: 'prices-2', usdPln: '8' }
      registerExecutor(paidExecutor({ cheap: doubled, dear }))
      await endOperation(operationId, { kind: 'result', content: {}, usage })
      expect(await operationOf(assignmentId)).toMatchObject({
        state: 'succeeded',
        potential_cost: '0.008000',
        actual_cost: '0.000080',
        price_list: cheap,
      })
    })
  })

  it('starts an operation of the local executor with no room in the budget, charging nothing (T3-AC03, T3-R03)', async () => {
    await setLimit(budgetMonth(new Date()), '0')
    const assignmentId = await place('free')
    answers = [{ kind: 'result', content: 'text', usage: nothingSent() }]
    await runOperation({ operationId: await operationIdOf(assignmentId) })
    expect(await operationOf(assignmentId)).toMatchObject({
      state: 'succeeded',
      potential_cost: '0.000000',
      actual_cost: '0.000000',
      budget_month: null,
      price_list: null,
    })
    expect(calls).toHaveLength(1)
    expect(await readMonthlyBudgets()).toEqual([
      {
        month: budgetMonth(new Date()),
        limit: '0.000000',
        settled: '0.000000',
        held: '0.000000',
        charge: '0.000000',
      },
    ])
  })

  it('with room for the second of two paid operations only, runs the second while the first waits for the budget (T3-AC04, T3-R04)', async () => {
    await setLimit(budgetMonth(new Date()), '0.010000')
    const first = await place('dear')
    const second = await place('cheap')
    for (const job of await jobs()) await runOperation(job)
    expect(await operationOf(first)).toMatchObject({
      state: 'pending',
      waits_for: 'budget',
      started_at: null,
    })
    expect(await operationOf(second)).toMatchObject({
      state: 'succeeded',
      budget_month: budgetMonth(new Date()),
    })
    expect(calls).toHaveLength(1)
  })

  it('counts the amounts carried from before the deployment against the room: an operation the carried settled and held amounts leave no room for waits for the budget, and is sent once the limit is raised (T10-R01, T3-R02, T3-R05)', async () => {
    const month = budgetMonth(new Date())
    // Limit 1.000; carried 0.600 settled and 0.395 held leave 0.005,
    // less than the 0.008 one cheap operation holds.
    await setLimit(month, '1.000000')
    await pool.query(
      'UPDATE ai_budget_months SET carried_settled=0.6,carried_held=0.395 WHERE month=$1',
      [month],
    )
    const assignmentId = await place('cheap')
    const operationId = await operationIdOf(assignmentId)
    expect(await startOperation(operationId)).not.toBe('started')
    expect(await operationOf(assignmentId)).toMatchObject({
      state: 'pending',
      waits_for: 'budget',
      budget_month: null,
    })
    await admin.query(`DELETE FROM ${queueSchema}.job`)
    // Still no room: the pass leaves it waiting.
    await runPass([budgetStep], fail)
    expect(await jobs()).toEqual([])
    // Raised by 0.003 the room is 0.008, exactly the operation's cost.
    await setLimit(month, '1.003000')
    await runPass([budgetStep], fail)
    expect(await jobs()).toEqual([{ name: paidJob.queue, operationId }])
    expect(await startOperation(operationId)).toBe('started')
    expect(await readMonthlyBudgets()).toEqual([
      {
        month,
        limit: '1.003000',
        settled: '0.600000',
        held: '0.403000',
        charge: '1.003000',
      },
    ])
  })

  describe('room appears (T3-R05)', () => {
    it('after the limit is raised, a pass of the periodic process sends the waiting operations oldest first as far as the room reaches and leaves the rest waiting (T3-AC05)', async () => {
      const month = budgetMonth(new Date())
      await setLimit(month, '0')
      const placed = [
        await place('cheap'),
        await place('dear'),
        await place('cheap'),
        await place('cheap'),
      ]
      for (const job of await jobs()) await runOperation(job)
      expect(calls).toHaveLength(0)
      await admin.query(`DELETE FROM ${queueSchema}.job`)
      // Room for 0.020: the first (0.008) fits, the second (0.016) does
      // not, the third (0.008) passes it, the fourth no longer fits.
      await setLimit(month, '0.020000')
      await runPass([budgetStep], fail)
      const operations = await Promise.all(placed.map(operationIdOf))
      expect((await jobs()).map((job) => job.operationId)).toEqual([
        operations[0],
        operations[2],
      ])
      for (const job of await jobs()) await runOperation(job)
      expect(
        await Promise.all(
          placed.map(async (id) => (await operationOf(id)).state),
        ),
      ).toEqual(['succeeded', 'pending', 'succeeded', 'pending'])
      expect((await operationOf(placed[1]!)).waits_for).toBe('budget')
      expect((await operationOf(placed[3]!)).waits_for).toBe('budget')
    })

    it('after the month changes, a pass of the periodic process sends the waiting operations as far as the new month reaches and leaves the rest waiting (T3-AC05)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(lastSecondOfNovember)
      await setLimit('2026-11', '0.008000')
      await pool.query('UPDATE ai_budget_default_limit SET limit_pln=0.016')
      const placed = [
        await place('cheap'),
        await place('cheap'),
        await place('cheap'),
        await place('cheap'),
      ]
      answers = [{ kind: 'result', content: {}, usage: unknownUsage() }]
      for (const job of await jobs()) await runOperation(job)
      expect(calls).toHaveLength(1)
      await admin.query(`DELETE FROM ${queueSchema}.job`)
      await runPass([budgetStep], fail)
      expect(await jobs()).toEqual([])
      vi.setSystemTime(firstOfDecember)
      await runPass([budgetStep], fail)
      const operations = await Promise.all(placed.map(operationIdOf))
      expect((await jobs()).map((job) => job.operationId)).toEqual([
        operations[1],
        operations[2],
      ])
      for (const job of await jobs()) await runOperation(job)
      expect(
        await Promise.all(placed.map(async (id) => await operationOf(id))),
      ).toMatchObject([
        { state: 'succeeded', budget_month: '2026-11' },
        { state: 'succeeded', budget_month: '2026-12' },
        { state: 'succeeded', budget_month: '2026-12' },
        { state: 'pending', waits_for: 'budget' },
      ])
    })

    it('sends an operation once when two passes run, and a start that finds no room makes it wait for the budget again', async () => {
      const month = budgetMonth(new Date())
      await setLimit(month, '0')
      const assignmentId = await place()
      for (const job of await jobs()) await runOperation(job)
      await admin.query(`DELETE FROM ${queueSchema}.job`)
      await setLimit(month, '0.008000')
      await runPass([budgetStep], fail)
      await runPass([budgetStep], fail)
      expect(await jobs()).toHaveLength(1)
      await setLimit(month, '0')
      await runOperation((await jobs())[0]!)
      expect(await operationOf(assignmentId)).toMatchObject({
        state: 'pending',
        waits_for: 'budget',
      })
    })
  })

  describe('carrying out (T3-R06)', () => {
    it.each([
      {
        name: 'a result',
        answer: {
          kind: 'result',
          content: { text: 'summary' },
          usage,
        } as ExecutorOutcome,
        row: {
          state: 'succeeded',
          cause: null,
          retryable: null,
          result: { text: 'summary' },
          actual_cost: '0.000080',
        },
        budget: { settled: '0.000080', held: '0.000000' },
        status: 'succeeded',
      },
      {
        name: 'a failure',
        answer: {
          kind: 'failed',
          retryable: true,
          cause: 'incomplete',
          usage,
        } as ExecutorOutcome,
        row: {
          state: 'failed',
          cause: 'incomplete',
          retryable: true,
          result: null,
          actual_cost: '0.000080',
        },
        budget: { settled: '0.000080', held: '0.000000' },
        status: 'in_progress',
      },
      {
        name: 'missing usage',
        answer: {
          kind: 'result',
          content: { text: 'summary' },
          usage: unknownUsage(),
        } as ExecutorOutcome,
        row: {
          state: 'succeeded',
          cause: null,
          result: { text: 'summary' },
          actual_cost: null,
        },
        budget: { settled: '0.000000', held: '0.008000' },
        status: 'succeeded',
      },
    ])(
      'ends an operation with $name in one save with its state, cost and the month charge, calling the executor once (T3-AC06)',
      async ({ answer, row, budget, status }) => {
        const assignmentId = await place()
        answers = [answer]
        await runOperation({ operationId: await operationIdOf(assignmentId) })
        expect(calls).toHaveLength(1)
        expect(calls[0]!.content).toMatchObject({
          instruction: 'Summarise the text.',
          input: 'Some text',
        })
        const operation = await operationOf(assignmentId)
        expect(operation).toMatchObject({
          ...row,
          potential_cost: '0.008000',
          usage: answer.usage,
        })
        expect(operation.finished_at).not.toBeNull()
        expect(await readMonthlyBudgets()).toMatchObject([budget])
        // A repeated job has no further effect and calls nothing.
        await runOperation({ operationId: operation.id })
        expect(calls).toHaveLength(1)
        // A result is delivered and the assignment succeeds (T6-R03); after
        // an ordinary failure it stays in progress with its next operation
        // (T4-R02).
        const { rows } = await pool.query(
          'SELECT status FROM ai_assignments WHERE id=$1',
          [assignmentId],
        )
        expect(rows[0].status).toBe(status)
      },
    )

    it('saves nothing for an end that finds its operation no longer running (T5-R04)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await startOperation(operationId)
      await pool.query(
        `UPDATE ai_operations SET state='uncertain',cause='unknown' WHERE id=$1`,
        [operationId],
      )
      expect(
        await endOperation(operationId, { kind: 'result', content: {}, usage }),
      ).toBe(false)
      expect(await operationOf(assignmentId)).toMatchObject({
        state: 'uncertain',
        result: null,
        actual_cost: null,
      })
    })

    it('ends a pending operation whose assignment is no longer in progress as not started, charging nothing and calling no executor', async () => {
      const assignmentId = await place()
      await pool.query(
        `UPDATE ai_assignments SET status='failed',failure_reason='rejected'
         WHERE id=$1`,
        [assignmentId],
      )
      await runOperation({ operationId: await operationIdOf(assignmentId) })
      expect(calls).toHaveLength(0)
      expect(await operationOf(assignmentId)).toMatchObject({
        state: 'failed',
        waits_for: null,
        cause: 'not_started',
        retryable: false,
        potential_cost: null,
        budget_month: null,
        started_at: null,
      })
    })

    it('leaves a result with its operation when the assignment failed while the operation ran', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await startOperation(operationId)
      await pool.query(
        `UPDATE ai_assignments SET status='failed',failure_reason='rejected'
         WHERE id=$1`,
        [assignmentId],
      )
      await endOperation(operationId, {
        kind: 'result',
        content: { a: 1 },
        usage,
      })
      expect(await operationOf(assignmentId)).toMatchObject({
        state: 'succeeded',
        result: { a: 1 },
      })
      const { rows } = await pool.query(
        'SELECT status FROM ai_assignments WHERE id=$1',
        [assignmentId],
      )
      expect(rows[0].status).toBe('failed')
    })

    it('does nothing for a job of an unknown operation', async () => {
      await runOperation({ operationId: randomUUID() })
      expect(calls).toHaveLength(0)
    })
  })

  describe('budget month (T3-R07)', () => {
    it('charges an operation started one second before midnight of the last day of a month in Polish time to that month, also when it ends in the next (T3-AC07)', async () => {
      const assignmentId = await place()
      const moments = [lastSecondOfNovember, firstOfDecember]
      await runOperation(
        { operationId: await operationIdOf(assignmentId) },
        () => moments.shift()!,
      )
      const operation = await operationOf(assignmentId)
      expect(operation).toMatchObject({
        state: 'succeeded',
        budget_month: '2026-11',
        started_at: lastSecondOfNovember,
        finished_at: firstOfDecember,
      })
      expect(await readMonthlyBudgets()).toMatchObject([
        { month: '2026-11', settled: '0.000080' },
      ])
    })

    it('creates the month of the first start without a budget with the default limit (T3-AC07)', async () => {
      await pool.query('UPDATE ai_budget_default_limit SET limit_pln=42.5')
      const assignmentId = await place()
      await startOperation(
        await operationIdOf(assignmentId),
        lastSecondOfNovember,
      )
      const { rows } = await pool.query(
        'SELECT month,limit_pln FROM ai_budget_months',
      )
      expect(rows).toEqual([{ month: '2026-11', limit_pln: '42.500000' }])
    })

    it('holds 100 PLN as the default limit after the migration', () => {
      expect(migratedDefault).toBe('100.000000')
    })
  })

  it('computes for an assignment with a settled, an unknown-cost and a never-started operation its potential, actual, charge and unknown count (T3-AC08, T3-R08)', async () => {
    const assignmentId = await place()
    answers = [
      { kind: 'failed', retryable: true, cause: 'http', usage },
      {
        kind: 'uncertain',
        cause: 'network',
        usage: unknownUsage(),
      },
    ]
    // The failure adds the second operation, which ends uncertain.
    for (const job of await jobs()) await runOperation(job)
    for (const job of await jobs()) await runOperation(job)
    // A never-started operation, as the owner's retry adds one.
    await pool.query(
      `INSERT INTO ai_operations(id,assignment_id,ordinal,origin,state,
        waits_for,pending_since)
       VALUES($1,$2,3,'manual','pending','executor',now())`,
      [randomUUID(), assignmentId],
    )
    expect(await readAssignmentCost(assignmentId)).toEqual({
      potential: '0.016000',
      actual: '0.000080',
      charge: '0.008080',
      unknownCosts: 1,
    })
  })

  it('reads two months newest first with their limit, settled and held amounts (T3-AC09, T3-R09)', async () => {
    await setLimit('2026-10', '50')
    await setLimit('2026-11', '100')
    const october = new Date('2026-10-15T12:00:00Z')
    const november = new Date('2026-11-15T12:00:00Z')
    const run = async (at: Date, answer: ExecutorOutcome | null) => {
      const operationId = await operationIdOf(await place())
      await startOperation(operationId, at)
      if (answer) await endOperation(operationId, answer, at)
    }
    await run(october, { kind: 'result', content: {}, usage })
    // November: settled, running and of unknown cost.
    await run(november, { kind: 'result', content: {}, usage })
    await run(november, null)
    await run(november, {
      kind: 'failed',
      retryable: true,
      cause: 'incomplete',
      usage: unknownUsage(),
    })
    // A never-started operation adds nothing.
    await place()
    expect(await readMonthlyBudgets()).toEqual([
      {
        month: '2026-11',
        limit: '100.000000',
        settled: '0.000080',
        held: '0.016000',
        charge: '0.016080',
      },
      {
        month: '2026-10',
        limit: '50.000000',
        settled: '0.000080',
        held: '0.000000',
        charge: '0.000080',
      },
    ])
  })

  describe('retries and needs attention (T4)', () => {
    const failure = (retryable = true): ExecutorOutcome => ({
      kind: 'failed',
      retryable,
      cause: 'http',
      usage,
    })
    const statusOf = async (assignmentId: string) =>
      (
        await pool.query('SELECT status FROM ai_assignments WHERE id=$1', [
          assignmentId,
        ])
      ).rows[0].status as string
    const operationsOf = async (assignmentId: string) =>
      (
        await pool.query(
          `SELECT id,ordinal,origin,state,waits_for,cause,retryable,
            potential_cost,actual_cost,budget_month
           FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal`,
          [assignmentId],
        )
      ).rows
    /** Runs every job sent, also those sent meanwhile, once each. */
    const runEveryJob = async () => {
      const done = new Set<string>()
      for (;;) {
        const { rows } = await admin.query(
          `SELECT id,data->>'operationId' AS "operationId"
           FROM ${queueSchema}.job WHERE name=ANY($1::text[])
           ORDER BY created_on,id`,
          [[paidJob.queue, freeJob.queue]],
        )
        const fresh = rows.filter((job: { id: string }) => !done.has(job.id))
        if (fresh.length === 0) return
        for (const job of fresh) {
          done.add(job.id)
          await runOperation({ operationId: job.operationId })
        }
      }
    }
    const expectNothingWaitingOrRunning = async (assignmentId: string) => {
      const operations = await operationsOf(assignmentId)
      expect(
        operations.filter((operation: { state: string }) =>
          ['pending', 'running'].includes(operation.state),
        ),
      ).toEqual([])
    }

    it('ends the third operation with a result after two ordinary failures, each operation carrying the same frozen content (T4-AC01)', async () => {
      const assignmentId = await place()
      answers = [failure(), failure()]
      await runEveryJob()
      expect(await operationsOf(assignmentId)).toMatchObject([
        { ordinal: 1, origin: 'automatic', state: 'failed', retryable: true },
        { ordinal: 2, origin: 'automatic', state: 'failed', retryable: true },
        { ordinal: 3, origin: 'automatic', state: 'succeeded' },
      ])
      expect(calls).toHaveLength(3)
      expect(calls[1]!.content).toEqual(calls[0]!.content)
      expect(calls[2]!.content).toEqual(calls[0]!.content)
      expect(calls[0]!.content).toMatchObject({
        instruction: 'Summarise the text.',
        input: 'Some text',
        responseFormat: { name: 'summary', schema: { type: 'object' } },
      })
      expect(calls.map((call) => call.parameters)).toEqual([
        { model: 'cheap' },
        { model: 'cheap' },
        { model: 'cheap' },
      ])
      expect(await statusOf(assignmentId)).toBe('succeeded')
    })

    it('adds the next operation in the save that ends the failed one, pending for its executor with its job sent (T4-R02)', async () => {
      const assignmentId = await place()
      const first = await operationIdOf(assignmentId)
      answers = [failure()]
      await runOperation({ operationId: first })
      const [, next] = await operationsOf(assignmentId)
      expect(next).toMatchObject({
        ordinal: 2,
        origin: 'automatic',
        state: 'pending',
        waits_for: 'executor',
        potential_cost: null,
      })
      expect((await jobs()).map((job) => job.operationId)).toEqual([
        first,
        next.id,
      ])
      expect(await statusOf(assignmentId)).toBe('in_progress')
    })

    it.each([
      {
        name: 'three ordinary failures',
        script: [failure(), failure(), failure()],
        operations: 3,
      },
      {
        name: 'a non-retryable failure',
        script: [failure(false)],
        operations: 1,
      },
      {
        name: 'an uncertain end',
        script: [
          {
            kind: 'uncertain',
            cause: 'network',
            usage: unknownUsage(),
          } as ExecutorOutcome,
        ],
        operations: 1,
      },
    ])(
      'moves the assignment to needs attention after $name, with no operation pending or running (T4-AC02, T4-R03)',
      async ({ script, operations }) => {
        const assignmentId = await place()
        answers = [...script]
        await runEveryJob()
        expect(await statusOf(assignmentId)).toBe('needs_attention')
        expect(await operationsOf(assignmentId)).toHaveLength(operations)
        expect(calls).toHaveLength(operations)
        await expectNothingWaitingOrRunning(assignmentId)
      },
    )

    it('moves the assignment to needs attention after an ordinary failure of an operation the owner added, without a further operation (T4-R01)', async () => {
      const assignmentId = await place()
      answers = [failure(false)]
      await runEveryJob()
      // The owner's retry, as oferty-pracy-sq2.13 adds it.
      await pool.query(
        "UPDATE ai_assignments SET status='in_progress' WHERE id=$1",
        [assignmentId],
      )
      const manual = randomUUID()
      await pool.query(
        `INSERT INTO ai_operations(id,assignment_id,ordinal,origin,state,
          waits_for,pending_since)
         VALUES($1,$2,2,'manual','pending','executor',now())`,
        [manual, assignmentId],
      )
      answers = [failure()]
      await runOperation({ operationId: manual })
      expect(await statusOf(assignmentId)).toBe('needs_attention')
      expect(await operationsOf(assignmentId)).toHaveLength(2)
    })

    it('carries out the next assignment of the paid executor after an operation of it ended uncertain (T4-AC03, T4-R04)', async () => {
      const first = await place()
      const second = await place()
      answers = [{ kind: 'uncertain', cause: 'network', usage: unknownUsage() }]
      await runEveryJob()
      expect(await statusOf(first)).toBe('needs_attention')
      expect(await operationsOf(second)).toMatchObject([{ state: 'succeeded' }])
      expect(calls).toHaveLength(2)
    })

    it('ends a pending operation whose background work failed on every attempt as an ordinary failure charging nothing, and adds the next operation (T4-AC05, T4-R06)', async () => {
      const assignmentId = await place()
      const first = await operationIdOf(assignmentId)
      // The worker calls the failure handler after the last attempt.
      await endFailedOperation({ operationId: first })
      const [ended, next] = await operationsOf(assignmentId)
      expect(ended).toMatchObject({
        state: 'failed',
        waits_for: null,
        cause: 'unknown',
        retryable: true,
        potential_cost: null,
        actual_cost: null,
        budget_month: null,
      })
      expect(next).toMatchObject({
        ordinal: 2,
        origin: 'automatic',
        state: 'pending',
        waits_for: 'executor',
      })
      expect((await jobs()).map((job) => job.operationId)).toEqual([
        first,
        next.id,
      ])
      expect(calls).toHaveLength(0)
      expect(await readMonthlyBudgets()).toEqual([])
      // A repeated failure handler, or one of an operation that ended, has
      // no effect.
      await endFailedOperation({ operationId: first })
      await runOperation({ operationId: next.id })
      await endFailedOperation({ operationId: next.id })
      expect(await operationsOf(assignmentId)).toMatchObject([
        { state: 'failed' },
        { state: 'succeeded' },
      ])
    })

    it('does nothing for a failure handler of an unknown operation', async () => {
      await endFailedOperation({ operationId: randomUUID() })
      expect(calls).toHaveLength(0)
    })

    it('after three operations whose background work failed, moves the assignment to needs attention', async () => {
      const assignmentId = await place()
      for (let ordinal = 1; ordinal <= 3; ordinal++) {
        const pending = (await operationsOf(assignmentId)).at(-1)!
        expect(pending).toMatchObject({ ordinal, state: 'pending' })
        await endFailedOperation({ operationId: pending.id })
      }
      expect(await statusOf(assignmentId)).toBe('needs_attention')
      await expectNothingWaitingOrRunning(assignmentId)
    })
  })

  describe('interrupted operations (T5)', () => {
    const statusOf = async (assignmentId: string) =>
      (
        await pool.query('SELECT status FROM ai_assignments WHERE id=$1', [
          assignmentId,
        ])
      ).rows[0].status as string
    const exchangeOf = async (operationId: string) =>
      (
        await pool.query(
          `SELECT kind,content FROM ai_operation_exchange
           WHERE operation_id=$1 ORDER BY sequence`,
          [operationId],
        )
      ).rows
    const uncertain = {
      state: 'uncertain',
      waits_for: null,
      cause: 'unknown',
      retryable: null,
      result: null,
      potential_cost: '0.008000',
      actual_cost: null,
    }

    it.each([
      {
        name: 'a later attempt of its background work',
        interrupt: (operationId: string) => runOperation({ operationId }),
      },
      {
        name: 'the failure handler after its last attempt',
        interrupt: (operationId: string) => endFailedOperation({ operationId }),
      },
    ])(
      'ends an operation interrupted before anything was sent, found running by $name, as uncertain with its potential cost charged, needing attention and calling no executor (T5-AC01, T5-AC04)',
      async ({ interrupt }) => {
        const assignmentId = await place()
        const operationId = await operationIdOf(assignmentId)
        // The attempt that started it was lost before calling its executor.
        expect(await startOperation(operationId)).toBe('started')
        await interrupt(operationId)
        const operation = await operationOf(assignmentId)
        expect(operation).toMatchObject({
          ...uncertain,
          budget_month: budgetMonth(new Date()),
        })
        expect(operation.finished_at).not.toBeNull()
        expect(calls).toHaveLength(0)
        expect(await exchangeOf(operationId)).toEqual([])
        expect(await statusOf(assignmentId)).toBe('needs_attention')
        expect(await readMonthlyBudgets()).toMatchObject([
          { settled: '0.000000', held: '0.008000' },
        ])
        // No further operation, and a repeated job or failure handler has
        // no further effect.
        await runOperation({ operationId })
        await endFailedOperation({ operationId })
        expect(
          (
            await pool.query(
              'SELECT state FROM ai_operations WHERE assignment_id=$1',
              [assignmentId],
            )
          ).rows,
        ).toEqual([{ state: 'uncertain' }])
        expect(calls).toHaveLength(0)
        expect(await jobs()).toHaveLength(1)
      },
    )

    it('changes neither the operation nor the assignment with a result saved after the operation was ended as uncertain, and keeps the raw response with the operation (T5-AC03, T5-R04)', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      let responded!: () => void
      const reached = new Promise<void>((resolve) => (responded = resolve))
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const late: string[] = []
      registerExecutor({
        ...paidExecutor(),
        async carryOut(work) {
          calls.push(work)
          await work.exchange('request', '{"input":"Some text"}')
          await work.exchange('response', '{"output":"raw"}')
          responded()
          await gate
          // Writes of the late process after the end match nothing.
          if (!(await work.exchange('response', 'late'))) late.push('exchange')
          if (!(await work.saveState({ late: true }))) late.push('state')
          return { kind: 'result', content: { text: 'late' }, usage }
        },
      })
      // The first attempt is still carrying the operation out when the
      // queue gives up on it and the next attempt runs.
      const first = runOperation({ operationId })
      await reached
      await runOperation({ operationId })
      expect(await statusOf(assignmentId)).toBe('needs_attention')
      release()
      await first
      expect(late).toEqual(['exchange', 'state'])
      expect(await operationOf(assignmentId)).toMatchObject({
        ...uncertain,
        usage: null,
        executor_state: null,
      })
      expect(await statusOf(assignmentId)).toBe('needs_attention')
      expect(await exchangeOf(operationId)).toEqual([
        { kind: 'request', content: '{"input":"Some text"}' },
        { kind: 'response', content: '{"output":"raw"}' },
      ])
      expect(calls).toHaveLength(1)
      expect(await readMonthlyBudgets()).toMatchObject([
        { settled: '0.000000', held: '0.008000' },
      ])
    })

    it('ends an operation interrupted while its assignment was no longer in progress as uncertain, leaving the assignment as it is', async () => {
      const assignmentId = await place()
      const operationId = await operationIdOf(assignmentId)
      await startOperation(operationId)
      await pool.query(
        `UPDATE ai_assignments SET status='failed',failure_reason='rejected'
         WHERE id=$1`,
        [assignmentId],
      )
      await endFailedOperation({ operationId })
      expect(await operationOf(assignmentId)).toMatchObject(uncertain)
      expect(await statusOf(assignmentId)).toBe('failed')
    })
  })

  describe('an executor that no longer offers the parameters (ASSUMPTION(oferty-pracy-sq2.4/ASM-1))', () => {
    it('fails the attempt of its start with nothing changed, and the budget pass leaves it waiting', async () => {
      const month = budgetMonth(new Date())
      await setLimit(month, '0')
      const waiting = await place('dear')
      const pending = await place('cheap')
      await runOperation({ operationId: await operationIdOf(waiting) })
      await admin.query(`DELETE FROM ${queueSchema}.job`)
      registerExecutor({
        ...paidExecutor(),
        services: { single: { offers: [], tools: [], maxRunSeconds: 60 } },
      })
      await setLimit(month, '100')
      await expect(
        runOperation({ operationId: await operationIdOf(pending) }),
      ).rejects.toThrow(/no longer offers/)
      expect(await operationOf(pending)).toMatchObject({
        state: 'pending',
        waits_for: 'executor',
      })
      await runPass([budgetStep], fail)
      expect(await jobs()).toEqual([])
      expect((await operationOf(waiting)).waits_for).toBe('budget')
      expect(calls).toHaveLength(0)
    })
  })
})
