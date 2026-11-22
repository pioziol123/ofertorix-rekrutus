import { budgetMonth } from '../domain/cost.ts'
import type { AiBudget, CurrentMonthBudget } from '../domain/budget.ts'
import { million, money } from '../domain/money.ts'
import {
  readDefaultLimit,
  readMonthBudgetRows,
  type MonthBudgetRow,
} from '../infrastructure/persistence/month-budgets.ts'

/**
 * The panel's budget view (T13-R01): the current month in Polish time with
 * its limit, the amount spent, the amounts held by running operations and
 * charged by operations of unknown cost with their number, the parts
 * carried from before the deployment and what remains, never below zero;
 * the earlier months with their limit and charge; and the default limit
 * (T13-R03). The months come from the same read as `readMonthlyBudgets`,
 * so the profile page's budget card shows the same limit and amounts that
 * add up to the same charge (T13-R05). A current month without a budget
 * yet is shown with the default limit it will start with (T3-R07) and
 * nothing charged; reading it creates nothing.
 */
export async function readBudget(now: Date = new Date()): Promise<AiBudget> {
  const month = budgetMonth(now)
  const rows = await readMonthBudgetRows()
  const defaultLimit = await readDefaultLimit()
  const current = rows.find((row) => row.month === month)
  return {
    current: currentMonth(
      current ?? {
        month,
        limit: defaultLimit,
        carriedSettled: '0.000000',
        carriedHeld: '0.000000',
        actual: '0.000000',
        running: '0.000000',
        unknownCost: '0.000000',
        unknownCount: 0,
        settled: '0.000000',
        held: '0.000000',
        charge: '0.000000',
      },
    ),
    earlier: rows
      .filter((row) => row.month < month)
      .map(({ month, limit, charge }) => ({ month, limit, charge })),
    defaultLimit,
  }
}

/** The figures of T13-R01 from the month's row. */
function currentMonth(row: MonthBudgetRow): CurrentMonthBudget {
  return {
    month: row.month,
    limit: row.limit,
    // ASSUMPTION(oferty-pracy-sq2.14/ASM-1): the carried settled part is
    // spent, the carried held part is charged beside the held amounts.
    spent: row.settled,
    running: row.running,
    unknownCost: row.unknownCost,
    unknownCount: row.unknownCount,
    carriedSettled: row.carriedSettled,
    carriedHeld: row.carriedHeld,
    charge: row.charge,
    remaining: remaining(row.limit, row.charge),
  }
}

/** The limit less the charge, zero when the charge is higher. */
function remaining(limit: string, charge: string): string {
  const left = millionths(limit) - millionths(charge)
  return money(left > 0n ? left : 0n)
}

/** An amount of six decimals, up to ten digits before the point, in millionths. */
function millionths(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.split('.')
  return BigInt(whole) * million + BigInt(fraction.padEnd(6, '0'))
}
