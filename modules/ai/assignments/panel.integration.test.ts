import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../../lib/db.ts'
import {
  countAssignmentsNeedingAttention,
  readAssignmentDetails,
  readAssignmentList,
} from '../index.ts'

/**
 * T11 of epic sq2 (task oferty-pracy-sq2.12): the reads of the AI
 * assignments panel on a real database. Assignments and operations are
 * written directly in the states the reads must show.
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const now = new Date('2026-11-22T12:00:00Z')
const hour = 3600 * 1000

integration('the reads of the AI assignments panel', () => {
  const schema = `ai_panel_${randomUUID().replaceAll('-', '').slice(0, 16)}`
  let admin: Pool
  let pool: Pool

  /** Inserts an assignment placed `hoursAgo` before `now`; returns its id. */
  const assignment = async (
    status: string,
    hoursAgo: number,
    extra: {
      settingsName?: string
      type?: 'single' | 'agent'
      label?: string
      failureReason?: string
    } = {},
  ) => {
    const id = randomUUID()
    const placedAt = new Date(now.getTime() - hoursAgo * hour)
    const type = extra.type ?? 'single'
    await pool.query(
      `INSERT INTO ai_assignments(id,settings_name,type,label,instruction,input,
        agent_options,executor,executor_parameters,status,failure_reason,
        automatic_operation_limit,placed_at,deadline,finished_at)
       VALUES($1,$2,$3,$4,'Instruction','Input',$5,'openai',
        '{"model":"gpt-6-luna","reasoningEffort":"low"}',$6,$7,3,$8,
        $8::timestamptz+interval '7 days',
        CASE WHEN $6 IN ('succeeded','failed') THEN $8::timestamptz+interval '1 hour' END)`,
      [
        id,
        extra.settingsName ?? 'matching',
        type,
        extra.label ?? `Oferta ${hoursAgo}`,
        type === 'agent'
          ? JSON.stringify({ tools: ['web_search'], resultInstruction: 'R' })
          : null,
        status,
        status === 'failed' ? (extra.failureReason ?? 'time_limit') : null,
        placedAt,
      ],
    )
    return id
  }

  /** Inserts an operation of an assignment with the given columns. */
  const operation = (
    assignmentId: string,
    ordinal: number,
    columns: Record<string, unknown>,
  ) => {
    const row: Record<string, unknown> = {
      id: randomUUID(),
      assignment_id: assignmentId,
      ordinal,
      origin: 'automatic',
      pending_since: new Date(now.getTime() - 10 * hour + ordinal * 60000),
      ...columns,
    }
    const names = Object.keys(row)
    return pool.query(
      `INSERT INTO ai_operations(${names.join(',')})
       VALUES(${names.map((_, i) => `$${i + 1}`).join(',')})`,
      Object.values(row),
    )
  }

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
    setPool(pool)
  }, 30_000)

  afterAll(async () => {
    await closePool()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.end()
  })

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE ai_operation_exchange,ai_operations,ai_assignments,ai_budget_months CASCADE',
    )
    await pool.query(
      `INSERT INTO ai_budget_months(month,limit_pln) VALUES('2026-11',100)`,
    )
  })

  it('T11-AC01: lists those needing attention first, then the rest from the newest, 50 at a time, with the row data of T11-R02', async () => {
    const statuses = ['in_progress', 'succeeded', 'failed', 'needs_attention']
    // 56 assignments, one per hour back, all four statuses; 14 need attention.
    const placed: { id: string; status: string; hoursAgo: number }[] = []
    for (let hoursAgo = 1; hoursAgo <= 56; hoursAgo++) {
      const status = statuses[hoursAgo % 4]!
      placed.push({
        id: await assignment(status, hoursAgo),
        status,
        hoursAgo,
      })
    }
    const expected = [
      ...placed.filter((a) => a.status === 'needs_attention'),
      ...placed.filter((a) => a.status !== 'needs_attention'),
    ].map((a) => a.id)

    const first = await readAssignmentList(null, now)
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).not.toBeNull()
    const second = await readAssignmentList(first.nextCursor, now)
    expect(second.items).toHaveLength(6)
    expect(second.nextCursor).toBeNull()
    expect(
      [...first.items, ...second.items].map((row) => row.assignmentId),
    ).toEqual(expected)
    expect(first.items.slice(0, 14).map((row) => row.status)).toEqual(
      Array(14).fill('needs_attention'),
    )
  })

  it('T11-AC01: a row gives the label, type, requesting module, executor, status, time left and budget charge', async () => {
    const running = await assignment('in_progress', 2, {
      type: 'agent',
      settingsName: 'research',
      label: 'Firma Acme',
    })
    await operation(running, 1, {
      state: 'failed',
      cause: 'http',
      retryable: true,
      potential_cost: '0.265',
      actual_cost: '0.01',
      budget_month: '2026-11',
      started_at: now,
      finished_at: now,
    })
    await operation(running, 2, {
      state: 'running',
      potential_cost: '0.265',
      budget_month: '2026-11',
      started_at: now,
    })
    const failed = await assignment('failed', 1, {
      settingsName: 'profile',
      failureReason: 'rejected',
    })
    const unknownSettings = await assignment('needs_attention', 3, {
      settingsName: 'removed-settings',
    })
    const { items } = await readAssignmentList(null, now)
    expect(items.map((row) => row.assignmentId)).toEqual([
      unknownSettings,
      failed,
      running,
    ])
    expect(items[2]).toEqual({
      assignmentId: running,
      label: 'Firma Acme',
      type: 'agent',
      requestingModule: 'Firmy',
      executor: 'openai',
      status: 'in_progress',
      failureReason: null,
      placedAt: new Date(now.getTime() - 2 * hour).toISOString(),
      deadline: new Date(
        now.getTime() - 2 * hour + 7 * 24 * hour,
      ).toISOString(),
      finishedAt: null,
      timeLeftSeconds: 7 * 24 * 3600 - 2 * 3600,
      charge: '0.275000',
    })
    expect(items[1]).toMatchObject({
      requestingModule: 'Profil',
      status: 'failed',
      failureReason: 'rejected',
      timeLeftSeconds: null,
      charge: '0.000000',
      finishedAt: new Date(now.getTime()).toISOString(),
    })
    // The settings name itself when the settings no longer hold it.
    expect(items[0]).toMatchObject({
      requestingModule: 'removed-settings',
      timeLeftSeconds: 7 * 24 * 3600 - 3 * 3600,
    })
    // Past its deadline, an assignment not yet final has no time left.
    expect(
      (await readAssignmentList(null, new Date(now.getTime() + 8 * 24 * hour)))
        .items[0]!.timeLeftSeconds,
    ).toBe(0)
  })

  it('gives an empty page for a cursor it did not write', async () => {
    await assignment('in_progress', 1)
    for (const cursor of ['nonsense', 'W10', btoa('[0,"x","y"]')])
      expect(await readAssignmentList(cursor, now)).toEqual({
        items: [],
        nextCursor: null,
      })
  })

  it('T11-AC02: the details of an assignment with a settled, a failed, an uncertain and a budget-waiting operation give the data of T11-R03 and no raw response', async () => {
    const id = await assignment('in_progress', 5, { label: 'Oferta 7' })
    const at = (minutes: number) => new Date(now.getTime() - minutes * 60000)
    await operation(id, 1, {
      state: 'succeeded',
      potential_cost: '0.265',
      actual_cost: '0.012345',
      budget_month: '2026-11',
      price_list: '{"model":"gpt-6-luna"}',
      usage: '{"sent":true}',
      result: '{"secret":"RESULT-CONTENT"}',
      started_at: at(50),
      finished_at: at(49),
    })
    await operation(id, 2, {
      state: 'failed',
      cause: 'context_overflow',
      retryable: false,
      potential_cost: '0.265',
      actual_cost: '0.000000',
      budget_month: '2026-11',
      started_at: at(40),
      finished_at: at(39),
    })
    await operation(id, 3, {
      origin: 'manual',
      state: 'uncertain',
      cause: 'unknown',
      potential_cost: '0.265',
      budget_month: '2026-11',
      started_at: at(30),
      finished_at: at(29),
    })
    await operation(id, 4, {
      origin: 'manual',
      state: 'pending',
      waits_for: 'budget',
    })
    const op = (
      await pool.query(
        'SELECT id FROM ai_operations WHERE assignment_id=$1 AND ordinal=1',
        [id],
      )
    ).rows[0].id
    await pool.query(
      `INSERT INTO ai_operation_exchange(operation_id,sequence,kind,content)
       VALUES($1,1,'request','RAW-REQUEST'),($1,2,'response','RAW-RESPONSE')`,
      [op],
    )

    const details = await readAssignmentDetails(id, now)
    const parameters = { model: 'gpt-6-luna', reasoningEffort: 'low' }
    expect(details).toEqual({
      assignmentId: id,
      label: 'Oferta 7',
      type: 'single',
      requestingModule: 'Dopasowanie',
      executor: 'openai',
      status: 'in_progress',
      failureReason: null,
      placedAt: new Date(now.getTime() - 5 * hour).toISOString(),
      deadline: new Date(
        now.getTime() - 5 * hour + 7 * 24 * hour,
      ).toISOString(),
      finishedAt: null,
      timeLeftSeconds: 7 * 24 * 3600 - 5 * 3600,
      charge: '0.277345',
      cost: {
        potential: '0.795000',
        actual: '0.012345',
        charge: '0.277345',
        unknownCosts: 1,
      },
      operations: [
        {
          ordinal: 1,
          origin: 'automatic',
          state: 'succeeded',
          waitsFor: null,
          executorParameters: parameters,
          pendingSince: expect.any(String),
          startedAt: at(50).toISOString(),
          finishedAt: at(49).toISOString(),
          potentialCost: '0.265000',
          actualCost: '0.012345',
          actualCostUnknown: false,
          cause: null,
          retryable: null,
        },
        {
          ordinal: 2,
          origin: 'automatic',
          state: 'failed',
          waitsFor: null,
          executorParameters: parameters,
          pendingSince: expect.any(String),
          startedAt: at(40).toISOString(),
          finishedAt: at(39).toISOString(),
          potentialCost: '0.265000',
          actualCost: '0.000000',
          actualCostUnknown: false,
          cause: 'context_overflow',
          retryable: false,
        },
        {
          ordinal: 3,
          origin: 'manual',
          state: 'uncertain',
          waitsFor: null,
          executorParameters: parameters,
          pendingSince: expect.any(String),
          startedAt: at(30).toISOString(),
          finishedAt: at(29).toISOString(),
          potentialCost: '0.265000',
          actualCost: null,
          actualCostUnknown: true,
          cause: 'unknown',
          retryable: null,
        },
        {
          ordinal: 4,
          origin: 'manual',
          state: 'pending',
          waitsFor: 'budget',
          executorParameters: parameters,
          pendingSince: expect.any(String),
          startedAt: null,
          finishedAt: null,
          potentialCost: null,
          actualCost: null,
          actualCostUnknown: false,
          cause: null,
          retryable: null,
        },
      ],
    })
    const text = JSON.stringify(details)
    for (const raw of ['RAW-REQUEST', 'RAW-RESPONSE', 'RESULT-CONTENT'])
      expect(text).not.toContain(raw)
  })

  it('T11-AC02: the details give the reason a failed assignment failed', async () => {
    const id = await assignment('failed', 1, {
      failureReason: 'delivery_failed',
    })
    expect(await readAssignmentDetails(id, now)).toMatchObject({
      status: 'failed',
      failureReason: 'delivery_failed',
      timeLeftSeconds: null,
      operations: [],
    })
  })

  it('gives no details for an unknown or malformed identifier', async () => {
    expect(await readAssignmentDetails(randomUUID(), now)).toBeNull()
    expect(await readAssignmentDetails('not-an-id', now)).toBeNull()
  })

  it('T11-R04: counts the assignments needing attention', async () => {
    expect(await countAssignmentsNeedingAttention()).toBe(0)
    await assignment('needs_attention', 1)
    await assignment('needs_attention', 2)
    await assignment('in_progress', 3)
    await assignment('failed', 4)
    expect(await countAssignmentsNeedingAttention()).toBe(2)
  })
})
