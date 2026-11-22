import { db } from '../../../../lib/db.ts'

/**
 * The budget of assignments' operations by month (solution design of epic
 * sq2, T3, "Contract: room in the budget"). A month that began before the
 * deployment carries the charge of the earlier records as two amounts,
 * settled and held, written once by the deployment's migration (T10-R01);
 * every other month carries zero. Amounts in SQL are złoty with six
 * decimals; the room is returned in millionths of a złoty, which may be
 * negative when the limit is below the month's charge.
 */

/**
 * The budget charge of an operation with a budget month (ZA-R04): its
 * actual cost when known, its potential cost otherwise.
 */
const charge = 'coalesce(o.actual_cost,o.potential_cost)'

/**
 * Creates the month with the default limit when it has no budget yet
 * (T3-R07) and locks its row until the caller's transaction ends, so a
 * check of the room and the charge are one step for every executor
 * (T3-R02).
 */
export async function lockMonth(month: string): Promise<void> {
  await db().query(
    `INSERT INTO ai_budget_months(month,limit_pln)
     SELECT $1,limit_pln FROM ai_budget_default_limit
     ON CONFLICT DO NOTHING`,
    [month],
  )
  await db().query(
    'SELECT month FROM ai_budget_months WHERE month=$1 FOR UPDATE',
    [month],
  )
}

/**
 * The room of a month in millionths of a złoty: its limit, or the default
 * limit when the month has no budget yet, less its carried amounts and the
 * charges of the operations of that month.
 */
export async function monthRoom(month: string): Promise<bigint> {
  const row = (
    await db().query<{ room: string }>(
      `SELECT ((coalesce(
          (SELECT limit_pln-carried_settled-carried_held
           FROM ai_budget_months WHERE month=$1),
          (SELECT limit_pln FROM ai_budget_default_limit))
        - coalesce((SELECT sum(${charge}) FROM ai_operations o
           WHERE o.budget_month=$1),0)) * 1000000)::bigint::text AS room`,
      [month],
    )
  ).rows[0]!
  return BigInt(row.room)
}

/**
 * One month with a budget, its amounts in złoty as decimal strings. The
 * month's charge is `carriedSettled`, `actual`, `running`, `unknownCost`
 * and `carriedHeld` together.
 */
export type MonthBudgetRow = {
  month: string
  limit: string
  /** The amounts carried from the earlier records (T10-R01). */
  carriedSettled: string
  carriedHeld: string
  /** The known actual costs of the month's operations. */
  actual: string
  /** The potential costs of the month's running operations. */
  running: string
  /**
   * The potential costs of the month's other operations whose actual cost
   * is not known: those that ended with an unknown cost.
   */
  unknownCost: string
  unknownCount: number
  /** The settled amount: the carried one and the known actual costs. */
  settled: string
  /** The held amount: the carried one and the potential costs not settled. */
  held: string
  /** The month's charge: settled and held together. */
  charge: string
}

const unknownCost = "o.actual_cost IS NULL AND o.state<>'running'"
const amountOf = (sum: string) => `coalesce(${sum},0)`

/**
 * Every month with a budget, newest first (T3-R09, T10-R01, T13-R01): its
 * limit, its carried amounts and, over its operations, the known actual
 * costs and the potential costs of those whose actual cost is not known,
 * split into running ones and those that ended with an unknown cost, with
 * the number of the latter; and the month's charge, all of these together.
 */
export async function readMonthBudgetRows(): Promise<MonthBudgetRow[]> {
  return (
    await db().query<MonthBudgetRow>(
      `SELECT month,"limit"::numeric(16,6)::text AS "limit",
        carried_settled::numeric(16,6)::text AS "carriedSettled",
        carried_held::numeric(16,6)::text AS "carriedHeld",
        actual::numeric(16,6)::text AS actual,
        running::numeric(16,6)::text AS running,
        unknown_cost::numeric(16,6)::text AS "unknownCost",
        unknown_count AS "unknownCount",
        (carried_settled+actual)::numeric(16,6)::text AS settled,
        (carried_held+running+unknown_cost)::numeric(16,6)::text AS held,
        (carried_settled+carried_held+actual+running+unknown_cost)
          ::numeric(16,6)::text AS charge
       FROM (
        SELECT b.month,b.limit_pln AS "limit",b.carried_settled,b.carried_held,
         ${amountOf('sum(o.actual_cost)')} AS actual,
         ${amountOf("sum(o.potential_cost) FILTER (WHERE o.actual_cost IS NULL AND o.state='running')")} AS running,
         ${amountOf(`sum(o.potential_cost) FILTER (WHERE ${unknownCost})`)} AS unknown_cost,
         (count(*) FILTER (WHERE ${unknownCost}))::int AS unknown_count
        FROM ai_budget_months b
        LEFT JOIN ai_operations o ON o.budget_month=b.month
        GROUP BY b.month) months
       ORDER BY month DESC`,
    )
  ).rows
}

/** The limit a new month starts with (T13-R03), in złoty. */
export async function readDefaultLimit(): Promise<string> {
  return (
    await db().query<{ limit: string }>(
      'SELECT limit_pln::numeric(16,6)::text AS "limit" FROM ai_budget_default_limit',
    )
  ).rows[0]!.limit
}

/**
 * Sets the limit of a month, creating its budget when it has none yet
 * (T13-R02). A start that holds the month's row waits for it or is waited
 * for; the last save wins.
 */
export async function saveMonthLimit(
  month: string,
  limit: string,
): Promise<void> {
  await db().query(
    `INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,$2)
     ON CONFLICT(month) DO UPDATE SET limit_pln=EXCLUDED.limit_pln`,
    [month, limit],
  )
}

/** Sets the limit a new month starts with (T13-R03); the last save wins. */
export async function saveDefaultLimit(limit: string): Promise<void> {
  await db().query('UPDATE ai_budget_default_limit SET limit_pln=$1', [limit])
}
