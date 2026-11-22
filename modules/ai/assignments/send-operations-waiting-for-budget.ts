import { transaction } from '../../../lib/db.ts'
import { sendJob } from '../../../lib/queues/index.ts'
import { budgetMonth } from '../domain/cost.ts'
import { decimal } from '../domain/money.ts'
import { findExecutor } from '../infrastructure/adapters/registry.ts'
import { monthRoom } from '../infrastructure/persistence/month-budgets.ts'
import {
  changeWait,
  operationsWaitingForBudget,
} from '../infrastructure/persistence/operations.ts'
import { currentPrice } from './current-price.ts'

/**
 * A step of the periodic process (solution design of epic sq2, T3,
 * "Operations waiting for the budget"; T3-R05): when the budget has room,
 * after a higher limit, in a new month or after a settlement below the
 * potential cost, operations waiting for the budget begin to wait for their
 * executor again, oldest first as far as the room reaches; a cheaper later
 * one may pass a dearer earlier one. The room of the current month is read
 * once; each operation whose potential cost at today's prices fits what
 * remains takes its cost off the remaining room and, in its own
 * transaction, waits for its executor again, conditional on still waiting
 * for the budget, with its job sent to the end of the executor's queue
 * (ZA-D02). The rest stay waiting. Nothing is charged here: the charge is
 * made at the start, which checks the budget again, so an operation another
 * start took the room from waits for the budget again. Returns the
 * operations sent.
 */
export async function sendOperationsWaitingForBudget(
  now: Date = new Date(),
): Promise<string[]> {
  let room = await monthRoom(budgetMonth(now))
  const sent: string[] = []
  for (const operation of await operationsWaitingForBudget()) {
    const executor = findExecutor(operation.executor)
    const price = currentPrice(operation)
    // ASSUMPTION(oferty-pracy-sq2.4/ASM-1)
    if (!executor || !price) continue
    const cost = decimal(price.potentialCost)
    if (cost > 0n && cost > room) continue
    const moved = await transaction(async () => {
      if (!(await changeWait(operation.id, 'budget', 'executor'))) return false
      await sendJob(executor.job, { operationId: operation.id })
      return true
    })
    if (!moved) continue
    room -= cost
    sent.push(operation.id)
  }
  return sent
}
