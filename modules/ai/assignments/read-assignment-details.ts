import type { AssignmentDetails } from '../domain/panel.ts'
import {
  readAssignmentRow,
  readExecutorParameters,
  readOperationDetailsRows,
} from '../infrastructure/persistence/panel.ts'
import { readAssignmentCost } from './read-assignment-cost.ts'
import { assignmentRow } from './read-assignment-list.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The details of one assignment for the panel (T11-R03): its row data with
 * the reason it failed, the cost figures of T3-R08 and its operations from
 * the first, each with its state, what a pending one waits for, the
 * executor's parameters, its start and end, its potential and actual cost
 * (an unknown one marked unknown) and the cause of a failure. It holds no
 * request, raw response or result. Null for an unknown or malformed
 * identifier. Reads committed state without row locks.
 */
export async function readAssignmentDetails(
  assignmentId: string,
  now: Date = new Date(),
): Promise<AssignmentDetails | null> {
  if (!uuid.test(assignmentId)) return null
  const row = await readAssignmentRow(assignmentId)
  if (!row) return null
  const cost = await readAssignmentCost(assignmentId)
  const parameters = await readExecutorParameters(assignmentId)
  const operations = await readOperationDetailsRows(assignmentId)
  return {
    ...assignmentRow(row, now),
    cost,
    operations: operations.map((operation) => ({
      ...operation,
      // Every operation carries out the assignment's frozen parameters.
      executorParameters: parameters,
      pendingSince: operation.pendingSince.toISOString(),
      startedAt: operation.startedAt?.toISOString() ?? null,
      finishedAt: operation.finishedAt?.toISOString() ?? null,
    })),
  }
}
