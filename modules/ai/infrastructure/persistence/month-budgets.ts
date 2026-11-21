import { db } from '../../../../lib/db.ts'

/**
 * The budget of assignments' operations by month (solution design of epic
 * sq2, T3, "Contract: room in the budget"). The month table and its limits
 * are shared with the old way until task oferty-pracy-sq2.11; the old way's
 * attempts are not counted here (ZA-D07), and the carried amounts are zero
 * until then. Amounts in SQL are złoty with six decimals; the room is
 * returned in millionths of a złoty, which may be negative when the limit
 * is below the month's charge.
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
 * limit when the month has no budget yet, less the charges of the
 * operations of that month.
 */
export async function monthRoom(month: string): Promise<bigint> {
  const row = (
    await db().query<{ room: string }>(
      `SELECT ((coalesce(
          (SELECT limit_pln FROM ai_budget_months WHERE month=$1),
          (SELECT limit_pln FROM ai_budget_default_limit))
        - coalesce((SELECT sum(${charge}) FROM ai_operations o
           WHERE o.budget_month=$1),0)) * 1000000)::bigint::text AS room`,
      [month],
    )
  ).rows[0]!
  return BigInt(row.room)
}

/** One month with a budget, its amounts in złoty as decimal strings. */
export type MonthBudgetRow = {
  month: string
  limit: string
  settled: string
  held: string
}

/**
 * Every month with a budget, newest first (T3-R09): its limit; the amount
 * settled, the known actual costs of its operations; and the amount held,
 * the potential costs of its operations whose actual cost is not known,
 * that is of running operations and of those with an unknown cost.
 */
export async function readMonthBudgetRows(): Promise<MonthBudgetRow[]> {
  return (
    await db().query<MonthBudgetRow>(
      `SELECT b.month,b.limit_pln::numeric(16,6)::text AS "limit",
        coalesce(sum(o.actual_cost),0)::numeric(16,6)::text AS settled,
        coalesce(sum(o.potential_cost) FILTER (WHERE o.actual_cost IS NULL),0)
          ::numeric(16,6)::text AS held
       FROM ai_budget_months b
       LEFT JOIN ai_operations o ON o.budget_month=b.month
       GROUP BY b.month,b.limit_pln ORDER BY b.month DESC`,
    )
  ).rows
}
