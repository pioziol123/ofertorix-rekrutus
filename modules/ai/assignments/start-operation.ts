import { transaction } from '../../../lib/db.ts'
import { budgetMonth } from '../domain/cost.ts'
import { decimal } from '../domain/money.ts'
import {
  lockMonth,
  monthRoom,
} from '../infrastructure/persistence/month-budgets.ts'
import {
  changeWait,
  endNotStarted,
  lockOperationToStart,
  setRunning,
} from '../infrastructure/persistence/operations.ts'
import { currentPrice } from './current-price.ts'
import { afterOperationEnd } from './after-operation-end.ts'
import { endInterruptedOperation } from './end-interrupted-operation.ts'

/** What the start of an operation did. */
export type StartOutcome =
  /** The operation runs now: carry it out. */
  | 'started'
  /** It waits for the budget; its job ends. */
  | 'waits_for_budget'
  /**
   * It succeeded and its assignment is still in progress: an earlier
   * attempt stopped before the delivery, which is to be made now (T6-R10).
   */
  | 'delivers'
  /** Nothing to carry out: it ended without starting, or is not pending. */
  | 'nothing'

/**
 * Starts a pending operation of an assignment in progress, in one
 * transaction (step 1 of the operation's handler, solution design of epic
 * sq2, T3). The operation's row is locked; then:
 * - waiting for its executor, assignment in progress: the potential cost is
 *   computed from the executor's price list valid now (T3-R02). Free work
 *   runs with no budget month and charges nothing (T3-R03). Otherwise the
 *   current month's row is locked, created with the default limit when
 *   missing (T3-R07), and the operation runs with its potential cost
 *   charged to that month when the room covers it; else it waits for the
 *   budget and does not hold its executor (T3-R04);
 * - pending, assignment no longer in progress: it ends as failed with the
 *   cause `not_started`, charging nothing;
 * - running: left by an attempt that ended or was lost; it ends as
 *   uncertain without calling the executor again, and its assignment needs
 *   attention (T5-R01);
 * - succeeded, assignment in progress: an earlier attempt ended it with a
 *   result and stopped before its delivery; the delivery is made next,
 *   without calling the executor (T6-R10);
 * - any other state, or an unknown operation: nothing happens.
 * `now` gives the moment of the start; its month in Polish time is the
 * operation's budget month.
 */
export async function startOperation(
  operationId: string,
  now: Date = new Date(),
): Promise<StartOutcome> {
  return transaction(async () => {
    const operation = await lockOperationToStart(operationId)
    if (operation?.state === 'running') {
      await endInterruptedOperation(operation, now)
      return 'nothing'
    }
    if (
      operation?.state === 'succeeded' &&
      operation.assignmentStatus === 'in_progress'
    )
      return 'delivers'
    if (operation?.state !== 'pending' || operation.waitsFor !== 'executor')
      return 'nothing'
    if (operation.assignmentStatus !== 'in_progress') {
      await endNotStarted(operationId, now)
      await afterOperationEnd({
        operationId,
        assignmentId: operation.assignmentId,
        assignmentStatus: operation.assignmentStatus,
        state: 'failed',
        retryable: false,
        origin: operation.origin,
        now,
      })
      return 'nothing'
    }
    const price = currentPrice(operation)
    // ASSUMPTION(oferty-pracy-sq2.4/ASM-1)
    if (!price)
      throw new Error(
        `Executor ${operation.executor} no longer offers the parameters of operation ${operationId}`,
      )
    const cost = decimal(price.potentialCost)
    if (cost === 0n) {
      await setRunning(operationId, {
        potentialCost: price.potentialCost,
        budgetMonth: null,
        priceList: price.priceList,
        startedAt: now,
      })
      return 'started'
    }
    const month = budgetMonth(now)
    await lockMonth(month)
    if ((await monthRoom(month)) < cost) {
      await changeWait(operationId, 'executor', 'budget')
      return 'waits_for_budget'
    }
    await setRunning(operationId, {
      potentialCost: price.potentialCost,
      budgetMonth: month,
      priceList: price.priceList,
      startedAt: now,
    })
    return 'started'
  })
}
