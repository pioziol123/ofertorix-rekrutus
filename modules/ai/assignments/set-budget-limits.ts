import { budgetMonth } from '../domain/cost.ts'
import { limitAmount } from '../domain/budget.ts'
import {
  saveDefaultLimit,
  saveMonthLimit,
} from '../infrastructure/persistence/month-budgets.ts'

/**
 * An amount refused as a limit (T13-R04); its message is for the owner.
 * Nothing changed.
 */
export class BudgetLimitError extends Error {
  override name = 'BudgetLimitError'
}

/** The amount the owner typed, or a refusal with its message. */
function checkedAmount(typed: string): string {
  const checked = limitAmount(typed)
  if ('refused' in checked) throw new BudgetLimitError(checked.refused)
  return checked.amount
}

/**
 * The owner sets the limit of the current month in Polish time (T13-R02),
 * creating its budget when it has none yet. Any amount of zero or more is
 * accepted, also below what the month already charged: then no paid
 * operation starts until the limit is raised or the month ends. A higher
 * limit lets operations waiting for the budget start at the next pass of
 * the periodic process (T13-R06, T3-R05). The next month starts with the
 * default limit. Setting the same amount again changes nothing; of two
 * saves the last wins. Throws `BudgetLimitError` for an invalid amount.
 */
export async function setCurrentMonthLimit(
  typed: string,
  now: Date = new Date(),
): Promise<void> {
  await saveMonthLimit(budgetMonth(now), checkedAmount(typed))
}

/**
 * The owner sets the limit a new month starts with (T13-R03). The current
 * month keeps its limit. Setting the same amount again changes nothing; of
 * two saves the last wins. Throws `BudgetLimitError` for an invalid amount.
 */
export async function setDefaultLimit(typed: string): Promise<void> {
  await saveDefaultLimit(checkedAmount(typed))
}
