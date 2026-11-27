import type { AssignmentStatus } from './assignment.ts'
import type { EndedOperationState, OperationOrigin } from './operation.ts'

/** What follows the end of an operation for its assignment. */
export type NextStep =
  /** Nothing in this transaction. */
  | 'nothing'
  /** A further automatic operation, pending and waiting for the executor. */
  | 'next_operation'
  /** The assignment needs attention. */
  | 'needs_attention'

/**
 * The rule of what follows the end of an operation (solution design of
 * epic sq2, "Contract: what follows the end of an operation"), from the
 * ended operation and the number of the assignment's automatic operations,
 * the ended one included, against its limit:
 * - an assignment that is not in progress is left as it is, also one that
 *   failed while its operation ran; a result stays with its operation;
 * - a result of an assignment in progress: nothing here, the handler
 *   delivers it next (T6-R03);
 * - an ordinary failure of an automatic operation while the assignment has
 *   fewer automatic operations than its limit and its deadline has not
 *   passed: a next operation, with no delay (T4-R01, T4-R02);
 * - any other failure, the last automatic one, a non-retryable one or one
 *   of an operation the owner added, and an uncertain end: needs attention
 *   (T4-R03);
 * - any failed or uncertain end past the deadline: needs attention with no
 *   further operation; the time limit fails the assignment at its next
 *   pass (T6-R08).
 */
export function nextStep(
  ended: {
    /** The assignment's status, read with its row locked. */
    assignmentStatus: AssignmentStatus
    state: EndedOperationState
    /** Whether a failed operation may be retried; null unless failed. */
    retryable: boolean | null
    origin: OperationOrigin
  },
  operations: {
    automaticOperations: number
    automaticOperationLimit: number
    deadlinePassed: boolean
  },
): NextStep {
  if (ended.assignmentStatus !== 'in_progress') return 'nothing'
  if (ended.state === 'succeeded') return 'nothing'
  if (
    ended.state === 'failed' &&
    ended.retryable === true &&
    ended.origin === 'automatic' &&
    !operations.deadlinePassed &&
    operations.automaticOperations < operations.automaticOperationLimit
  )
    return 'next_operation'
  return 'needs_attention'
}
