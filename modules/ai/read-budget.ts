import { db } from '../../lib/db.ts'
import { budgetMonth } from './domain/cost.ts'
import { decimal, money } from './domain/money.ts'
import { readBudgetMonth } from './infrastructure/persistence/budget.ts'

export type AiBudget = {
  /** The budget period: a month in Europe/Warsaw. */
  month: string
  limit: string
  /** Reserved by attempts not settled yet, unknown costs included. */
  reserved: string
  settled: string
  /** What new requests may still reserve. */
  available: string
}

/** The shared budget of the period that contains the given moment. */
export async function readBudget(now = new Date()): Promise<AiBudget> {
  const month = budgetMonth(now)
  const amounts = await readBudgetMonth(db(), month)
  const available =
    decimal(amounts.limit) -
    decimal(amounts.settled) -
    decimal(amounts.reserved)
  return {
    month,
    limit: money(decimal(amounts.limit)),
    reserved: money(decimal(amounts.reserved)),
    settled: money(decimal(amounts.settled)),
    available: available > 0n ? money(available) : '0.000000',
  }
}
