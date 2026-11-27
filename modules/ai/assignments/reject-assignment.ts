import { transaction } from '../../../lib/db.ts'
import { ownerActions } from '../domain/assignment.ts'
import type { AssignmentActionOutcome } from '../domain/panel.ts'
import {
  lockAssignment,
  saveRejected,
} from '../infrastructure/persistence/assignments.ts'
import { assignmentReceiver } from './assignment-receiver.ts'
import { endPendingOperations } from './end-pending-operations.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Where the error of a Reject that could not be saved goes. */
export type RejectErrorLog = (message: string) => void

/**
 * The owner's Reject of an assignment from the panel (solution design of
 * epic sq2, T11–T13, "Reject"; T12-R03), in one transaction with the
 * assignment's row locked: when the rule of the owner's actions
 * (`ownerActions`) allows Reject for its status, read under the lock, it
 * fails at `now` with the reason "rejected by the owner"; its pending
 * operations end as not started,
 * charging nothing; its receiver's failure entry is called, when one is
 * registered, so the requesting module learns of the end in the same save
 * (T6-R02). A running operation is not stopped: it ends and is settled by
 * its own handler, and its result stays with it, since nothing is
 * delivered for an assignment no longer in progress.
 *
 * A final assignment is left as it is, and the current status is returned
 * with `changed` false (T12-R04, ZA-R03): a second Reject, also one sent
 * together with the first, waits for the first's lock and changes nothing,
 * so the receiver is called once. Null for an unknown or malformed
 * identifier. An error, of the receiver or the database, rolls everything
 * back, so the assignment and its operations stay as they were; it is
 * logged with the assignment's identifier and raised, and the owner can
 * reject again (T12-R06, T6-R05).
 */
export async function rejectAssignment(
  assignmentId: string,
  now: Date = new Date(),
  log: RejectErrorLog = console.error,
): Promise<AssignmentActionOutcome | null> {
  if (!uuid.test(assignmentId)) return null
  try {
    return await transaction(async () => {
      const assignment = await lockAssignment(assignmentId, now)
      if (!assignment) return null
      if (!ownerActions(assignment).reject)
        return { changed: false, status: assignment.status }
      await saveRejected(assignmentId, now)
      await endPendingOperations(assignmentId, now)
      await assignmentReceiver(assignment.settingsName)?.receiveFailure({
        assignmentId,
      })
      return { changed: true, status: 'failed' as const }
    })
  } catch (error) {
    log(
      `The owner's Reject could not end assignment ${assignmentId}: ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}
