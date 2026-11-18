import type { QueryExecutor } from '../../../../lib/db.ts'
import type { AiConfiguration } from '../../model-catalog.ts'
import { attemptCeiling, budgetMonth } from '../../domain/cost.ts'
import { decimal, money } from '../../domain/money.ts'

/** The limit a month gets when its first attempt is reserved. */
const defaultLimit = '100.000000'

/**
 * Checks the shared monthly budget for one more attempt. It locks the month
 * row until the caller's transaction ends and writes no reservation: the
 * caller records the attempt with the returned month and cost in the same
 * transaction.
 */
export async function reserve(
  client: QueryExecutor,
  config: AiConfiguration,
  now = new Date(),
  extraCost = '0',
) {
  const month = budgetMonth(now)
  await client.query(
    'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [month, defaultLimit],
  )
  await client.query(
    'SELECT month FROM ai_budget_months WHERE month=$1 FOR UPDATE',
    [month],
  )
  const cost = money(decimal(attemptCeiling(config)) + decimal(extraCost))
  const available = await client.query(
    `SELECT limit_pln-coalesce((SELECT sum(CASE WHEN state='settled' THEN actual_pln ELSE reserved_pln END) FROM ai_attempts WHERE month=$1),0) >= $2::numeric AS enough FROM ai_budget_months WHERE month=$1`,
    [month, cost],
  )
  return { month, cost, enough: available.rows[0].enough as boolean }
}

/** The month's limit and the reserved and settled amounts of its attempts. */
export async function readBudgetMonth(executor: QueryExecutor, month: string) {
  const row = (
    await executor.query(
      `SELECT (SELECT limit_pln FROM ai_budget_months WHERE month=$1) AS limit_pln,
        coalesce(sum(CASE WHEN state='settled' THEN actual_pln ELSE 0 END),0) AS settled,
        coalesce(sum(CASE WHEN state!='settled' THEN reserved_pln ELSE 0 END),0) AS reserved
       FROM ai_attempts WHERE month=$1`,
      [month],
    )
  ).rows[0]
  return {
    limit: (row.limit_pln as string | null) ?? defaultLimit,
    settled: row.settled as string,
    reserved: row.reserved as string,
  }
}

/**
 * Every month with a budget, newest first: its limit and the settled and
 * reserved amounts of its attempts, as the database sums them.
 */
// ASSUMPTION(oferty-pracy-0mq.11/ASM-2): the query the profile route ran.
export async function readBudgetMonths(executor: QueryExecutor) {
  const rows = (
    await executor.query(
      `SELECT b.month,b.limit_pln,
        coalesce(sum(CASE WHEN a.state='settled' THEN a.actual_pln ELSE 0 END),0) AS settled,
        coalesce(sum(CASE WHEN a.state!='settled' THEN a.reserved_pln ELSE 0 END),0) AS reserved
       FROM ai_budget_months b LEFT JOIN ai_attempts a ON a.month=b.month GROUP BY b.month ORDER BY b.month DESC`,
    )
  ).rows
  return rows.map((row) => ({
    month: row.month as string,
    limit: row.limit_pln as string,
    settled: row.settled as string,
    reserved: row.reserved as string,
  }))
}
