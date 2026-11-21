import { decimal, money } from '../domain/money.ts'
import { readMonthBudgetRows } from '../infrastructure/persistence/month-budgets.ts'

/** The budget of one month of assignments' operations, in złoty. */
export type MonthlyBudget = {
  /** The month in the form year-month, in Polish time. */
  month: string
  limit: string
  /** Known actual costs of the month's operations. */
  settled: string
  /**
   * Potential costs of the month's running operations and of its
   * operations with an unknown cost.
   */
  held: string
  /** The month's charge: settled and held together. */
  charge: string
}

/**
 * Every month that has a budget, newest first, with its limit and the
 * amounts its operations settled and hold (T3-R09). The carried amounts of
 * the earlier records join them in task oferty-pracy-sq2.11, where the
 * budget card of the profile page moves to this read; the panel uses it
 * from task oferty-pracy-sq2.14. The old way's attempts are not counted
 * (ZA-D07).
 */
export async function readMonthlyBudgets(): Promise<MonthlyBudget[]> {
  return (await readMonthBudgetRows()).map((row) => ({
    ...row,
    charge: money(decimal(row.settled) + decimal(row.held)),
  }))
}
