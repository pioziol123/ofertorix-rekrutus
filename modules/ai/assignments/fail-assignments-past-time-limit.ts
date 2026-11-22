import { transaction } from '../../../lib/db.ts'
import {
  assignmentsPastTimeLimit,
  failPastTimeLimit,
} from '../infrastructure/persistence/assignments.ts'
import { assignmentReceiver } from './assignment-receiver.ts'
import { endPendingOperations } from './end-pending-operations.ts'

/** Where the error of one assignment's end goes; the error log by default. */
export type TimeLimitErrorLog = (message: string) => void

/**
 * A step of the periodic process (solution design of epic sq2, T6, "Time
 * limit"): fails every assignment past its time limit of 7 days from
 * placing, also one that needs attention, with the reason "time limit
 * exceeded" (T6-R06, T6-R07). Two kinds are left alone: one with a running
 * operation, which may still end with a result (T6-R08), and one in
 * progress with a succeeded operation, whose delivery is still to be made.
 *
 * Each assignment ends in its own transaction: a write conditional on the
 * rule still holding with its row locked sets it failed; each of its
 * pending operations ends as not started, charging nothing, and what
 * follows that end is decided by the one rule for every ended operation,
 * which leaves an assignment no longer in progress as it is; its
 * receiver's failure entry is called, when one is registered, so the
 * requesting module learns of the end in the same save (T6-R02). An
 * error, of the receiver or the database, rolls that transaction back and
 * is logged with the assignment's identifier; the other assignments are
 * still handled and the next pass, a minute later, tries again (T6-R05).
 * A failed assignment is not taken again. Returns the assignments failed.
 */
export async function failAssignmentsPastTimeLimit(
  now: Date = new Date(),
  log: TimeLimitErrorLog = console.error,
): Promise<string[]> {
  const failed: string[] = []
  for (const assignmentId of await assignmentsPastTimeLimit(now)) {
    try {
      const ended = await transaction(async () => {
        const assignment = await failPastTimeLimit(assignmentId, now)
        if (!assignment) return false
        await endPendingOperations(assignmentId, now)
        await assignmentReceiver(assignment.settingsName)?.receiveFailure({
          assignmentId,
        })
        return true
      })
      if (ended) failed.push(assignmentId)
    } catch (error) {
      log(
        `The time limit could not end assignment ${assignmentId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return failed
}
