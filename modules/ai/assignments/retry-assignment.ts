import { transaction } from '../../../lib/db.ts'
import type { AssignmentActionOutcome } from '../domain/panel.ts'
import {
  lockAssignment,
  readAssignmentOperations,
  setInProgressForRetry,
} from '../infrastructure/persistence/assignments.ts'
import { addOperation } from './after-operation-end.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The owner's Retry of an assignment from the panel (solution design of
 * epic sq2, T11–T13, "Retry"; T12-R01), in one transaction with the
 * assignment's row locked: a write conditional on the assignment needing
 * attention and its deadline not passed at `now` makes it in progress
 * again, its deadline unchanged, and one operation with the origin manual
 * is added: pending, waiting for its executor, its job sent in the same
 * save, carrying out the assignment's frozen content. It counts beyond the
 * automatic operations, so its failure of any kind returns the assignment
 * to needs attention with no further operation (T12-R02).
 *
 * An assignment the status or the deadline no longer allows (in progress,
 * final, past its time limit) is left as it is, and the current status is
 * returned with `changed` false (T12-R04, ZA-R03); a repeated Retry is one
 * of those. Null for an unknown or malformed identifier. A database error
 * rolls everything back and is raised.
 */
export async function retryAssignment(
  assignmentId: string,
  now: Date = new Date(),
): Promise<AssignmentActionOutcome | null> {
  if (!uuid.test(assignmentId)) return null
  return transaction(async () => {
    const assignment = await lockAssignment(assignmentId)
    if (!assignment) return null
    if (!(await setInProgressForRetry(assignmentId, now)))
      return { changed: false, status: assignment.status }
    await addOperation(
      assignmentId,
      await readAssignmentOperations(assignmentId),
      'manual',
    )
    return { changed: true, status: 'in_progress' }
  })
}
