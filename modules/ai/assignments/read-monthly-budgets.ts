import { readMonthBudgetRows } from '../infrastructure/persistence/month-budgets.ts'

/** The budget of one month of assignments' operations, in złoty. */
export type MonthlyBudget = {
  /** The month in the form year-month, in Polish time. */
  month: string
  limit: string
  /**
   * The settled amount carried from the earlier records and the known
   * actual costs of the month's operations.
   */
  settled: string
  /**
   * The held amount carried from the earlier records and the potential
   * costs of the month's running operations and of its operations with an
   * unknown cost.
   */
  held: string
  /** The month's charge: settled and held together. */
  charge: string
}

/**
 * Every month that has a budget, newest first, with its limit and the
 * amounts settled and held, the carried ones of the earlier records
 * included (T3-R09, T10-R01). The budget card of the profile page reads it
 * (T10-R06); the panel's budget view reads the same months through
 * `readBudget` (T13-R01), so the two show the same figures.
 */
export async function readMonthlyBudgets(): Promise<MonthlyBudget[]> {
  return (await readMonthBudgetRows()).map(
    ({ month, limit, settled, held, charge }) => ({
      month,
      limit,
      settled,
      held,
      charge,
    }),
  )
}
