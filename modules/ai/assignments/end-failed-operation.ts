import { transaction } from '../../../lib/db.ts'
import type { OperationJobData } from '../executors/declaration.ts'
import {
  endPendingAsFailed,
  lockOperationToStart,
} from '../infrastructure/persistence/operations.ts'
import { afterOperationEnd } from './after-operation-end.ts'
import { endInterruptedOperation } from './end-interrupted-operation.ts'

/**
 * The failure handler of every executor's queue (solution design of epic
 * sq2, T4), called by the worker through the failure queue after the job of
 * an operation failed on its last attempt, also when the worker died in
 * it. The assignment's row and the operation's are locked; then:
 * - a pending operation, whose background work failed finally before it
 *   started, ends as an ordinary failure with the cause `unknown` and no
 *   cost, so it charges nothing (T4-R06), and what follows the end is
 *   decided for its assignment: its next operation or needs attention;
 * - a running one, whose last attempt was lost or passed its time limit,
 *   ends as uncertain without calling the executor again, and its
 *   assignment needs attention (T5-R01, T5-R03);
 * - any other state, or an unknown operation: nothing happens.
 * The end is conditional on the operation's state, so a repeated call has
 * no further effect.
 */
export async function endFailedOperation(
  { operationId }: OperationJobData,
  now: Date = new Date(),
): Promise<void> {
  await transaction(async () => {
    const operation = await lockOperationToStart(operationId)
    if (operation?.state === 'running')
      return endInterruptedOperation(operation, now)
    if (operation?.state !== 'pending') return
    await endPendingAsFailed(operationId, now)
    await afterOperationEnd({
      operationId,
      assignmentId: operation.assignmentId,
      assignmentStatus: operation.assignmentStatus,
      state: 'failed',
      retryable: true,
      origin: operation.origin,
    })
  })
}
