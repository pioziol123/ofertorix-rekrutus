import { readStatuses } from '../infrastructure/persistence/assignments.ts'
import type { AssignmentStatus } from './assignment.ts'

/** The status of one assignment: its identifier and status, nothing else. */
export type AssignmentStatusEntry = {
  assignmentId: string
  status: AssignmentStatus
}

export type AssignmentStatuses = {
  /** Each known assignment of the list, in the order of the list. */
  found: AssignmentStatusEntry[]
  /** Each identifier of the list no assignment has. */
  notFound: string[]
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads the status of assignments by their identifiers (T1-R07), from
 * committed state and without row locks. It gives no operations, costs,
 * causes or reasons. An identifier repeated in the list is answered once;
 * an empty list gets an empty answer. A requesting module uses it to show
 * that work is in progress, not to learn of an assignment's end (T6-R11).
 */
export async function readAssignmentStatuses(
  assignmentIds: readonly string[],
): Promise<AssignmentStatuses> {
  const ids = [...new Set(assignmentIds)]
  const statuses = await readStatuses(ids.filter((id) => uuid.test(id)))
  const found: AssignmentStatusEntry[] = []
  const notFound: string[] = []
  for (const id of ids) {
    const status = statuses.get(id.toLowerCase())
    if (status) found.push({ assignmentId: id, status })
    else notFound.push(id)
  }
  return { found, notFound }
}
