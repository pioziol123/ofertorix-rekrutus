import type { AssignmentStatus } from './assignment.ts'

/** An operation that has just ended, with its assignment's status. */
export type EndedOperation = {
  operationId: string
  assignmentId: string
  /** The assignment's status, read with its row locked. */
  assignmentStatus: AssignmentStatus
  state: 'succeeded' | 'failed' | 'uncertain'
}

/**
 * Decides what follows the end of an operation for its assignment (solution
 * design of epic sq2, "Contract: what follows the end of an operation"). It
 * runs in the transaction that ended the operation, after the assignment's
 * row was locked, and every caller that ends an operation uses it.
 *
 * The rows of this task (oferty-pracy-sq2.4): an assignment that is not in
 * progress, also one that failed while its operation ran, is left as it is,
 * and a result stays with its operation. The rows of an assignment in
 * progress are added by their tasks: delivering a result by
 * oferty-pracy-sq2.7, the next operation or needs attention after a failed
 * or uncertain end by oferty-pracy-sq2.5. Until then such an assignment
 * stays in progress with nothing pending, a state of the build only
 * (requirements of epic sq2, T3 scope).
 */
export async function afterOperationEnd(ended: EndedOperation): Promise<void> {
  if (ended.assignmentStatus !== 'in_progress') return
}
