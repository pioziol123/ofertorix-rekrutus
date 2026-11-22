import type { AssignmentDetails } from '../domain/panel.ts'
import { readAssignmentDetailsRow } from '../infrastructure/persistence/panel.ts'
import { assignmentRow } from './read-assignment-list.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The details of one assignment for the panel (T11-R03): its row data with
 * the reason it failed, the cost figures of T3-R08 and its operations from
 * the first, each with its state, what a pending one waits for, the
 * executor's parameters, its start and end, its potential and actual cost
 * (an unknown one marked unknown) and the cause of a failure. It holds no
 * request, raw response or result. Null for an unknown or malformed
 * identifier.
 *
 * Every part is read in one statement, so the row, the cost figures and
 * the operations of one answer come from the same moment of committed
 * state, and the row's budget charge is the one of the cost figures.
 * Without row locks: work on the assignment goes on, and a later read
 * shows its next state.
 */
export async function readAssignmentDetails(
  assignmentId: string,
  now: Date = new Date(),
): Promise<AssignmentDetails | null> {
  if (!uuid.test(assignmentId)) return null
  const row = await readAssignmentDetailsRow(assignmentId)
  if (!row) return null
  return {
    ...assignmentRow(row, now),
    charge: row.cost.charge,
    cost: {
      potential: row.cost.potential,
      actual: row.cost.actual,
      charge: row.cost.charge,
      unknownCosts: row.cost.unknown,
    },
    operations: row.operations.map((operation) => ({
      ...operation,
      // Every operation carries out the assignment's frozen parameters.
      executorParameters: row.executorParameters,
    })),
  }
}
