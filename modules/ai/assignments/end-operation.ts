import { transaction } from '../../../lib/db.ts'
import type { ExecutorOutcome } from '../ports/executor.ts'
import {
  lockRunningToEnd,
  saveEnd,
  type OperationEnd,
} from '../infrastructure/persistence/operations.ts'
import { afterOperationEnd } from './after-operation-end.ts'
import { actualCost } from '../domain/operation-cost.ts'

/**
 * Ends a running operation with its executor's outcome in one transaction
 * (step 3 of the operation's handler, solution design of epic sq2, T3;
 * T3-R06): the state, the result or the cause with whether it may be
 * retried, the usage and the actual cost, computed from the usage and the
 * price list saved when it started, or unknown. Its budget charge follows
 * from them (ZA-R04); its budget month stays the one it started in. Then
 * what follows the end is decided for the assignment. The write is
 * conditional on the operation still running: when it no longer runs,
 * nothing is saved and false is returned (T5-R04).
 */
export async function endOperation(
  operationId: string,
  outcome: ExecutorOutcome,
  now: Date = new Date(),
): Promise<boolean> {
  return transaction(async () => {
    const running = await lockRunningToEnd(operationId)
    if (!running) return false
    const end: OperationEnd = {
      ...stateOf(outcome),
      usage: outcome.usage,
      actualCost: actualCost(outcome.usage, running.priceList),
      finishedAt: now,
    }
    if (!(await saveEnd(operationId, end))) return false
    await afterOperationEnd({
      operationId,
      assignmentId: running.assignmentId,
      assignmentStatus: running.assignmentStatus,
      state: end.state,
      retryable: end.retryable,
      origin: running.origin,
      now,
    })
    return true
  })
}

function stateOf(
  outcome: ExecutorOutcome,
): Pick<OperationEnd, 'state' | 'cause' | 'retryable' | 'result'> {
  switch (outcome.kind) {
    case 'result':
      return {
        state: 'succeeded',
        cause: null,
        retryable: null,
        result: outcome.content,
      }
    case 'failed':
      return {
        state: 'failed',
        cause: outcome.cause,
        retryable: outcome.retryable,
        result: null,
      }
    case 'uncertain':
      return {
        state: 'uncertain',
        cause: outcome.cause,
        retryable: null,
        result: null,
      }
  }
}
