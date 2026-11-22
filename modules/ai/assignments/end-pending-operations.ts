import {
  endNotStarted,
  lockPendingOperations,
} from '../infrastructure/persistence/operations.ts'
import { afterOperationEnd } from './after-operation-end.ts'

/**
 * Ends every pending operation of an assignment that has just failed, by
 * the time limit (T6-R07) or the owner's Reject (T12-R03), as failed with
 * the cause `not_started`, charging nothing; what follows each end is
 * decided by the one rule for every ended operation, which leaves the
 * failed assignment as it is. The caller holds the lock on the assignment's
 * row, in the transaction that failed it. A running operation is left to
 * end by itself.
 */
export async function endPendingOperations(
  assignmentId: string,
  now: Date,
): Promise<void> {
  for (const operation of await lockPendingOperations(assignmentId)) {
    await endNotStarted(operation.id, now)
    await afterOperationEnd({
      operationId: operation.id,
      assignmentId,
      assignmentStatus: 'failed',
      state: 'failed',
      retryable: false,
      origin: operation.origin,
      now,
    })
  }
}
