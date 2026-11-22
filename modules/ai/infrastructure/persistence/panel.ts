import { db } from '../../../../lib/db.ts'
import type {
  AssignmentStatus,
  AssignmentType,
} from '../../assignments/assignment.ts'
import type {
  OperationState,
  OperationWait,
} from '../../domain/operation-state.ts'
import type { AssignmentFailureReason } from '../../domain/panel.ts'
import type { OperationCause } from '../../executors/outcome.ts'
import type { OperationOrigin } from './operations.ts'
import { operationsCharge, unknownActualCost } from './operations.ts'

/**
 * The position of a row in the panel's order: needing attention first
 * (group 0, the rest group 1), then placed at and identifier descending.
 */
export type ListPosition = { group: 0 | 1; placedAt: string; id: string }

/** One assignment as the panel's list reads it, amounts in złoty. */
export type AssignmentListRow = {
  id: string
  settingsName: string
  label: string
  type: AssignmentType
  executor: string
  status: AssignmentStatus
  failureReason: AssignmentFailureReason | null
  placedAt: Date
  deadline: Date
  finishedAt: Date | null
  charge: string
  /**
   * The row's position for the next cursor, its placing time in UTC exact
   * to the microsecond (`2026-11-22T12:00:00.000000Z`).
   */
  position: ListPosition
}

const listColumns = `a.id,a.settings_name AS "settingsName",a.label,a.type,
  a.executor,a.status,a.failure_reason AS "failureReason",
  a.placed_at AS "placedAt",a.deadline,a.finished_at AS "finishedAt",
  (SELECT ${operationsCharge} FROM ai_operations WHERE assignment_id=a.id)
    AS charge,
  CASE WHEN a.status='needs_attention' THEN 0 ELSE 1 END AS "group",
  to_char(a.placed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS "placedAtText"`

type RawListRow = Omit<AssignmentListRow, 'position'> & {
  group: 0 | 1
  placedAtText: string
}

const toListRow = ({ group, placedAtText, ...row }: RawListRow) => ({
  ...row,
  position: { group, placedAt: placedAtText, id: row.id },
})

/**
 * Up to `limit` assignments after `after` in the panel's order, without
 * row locks; from the first without `after`.
 */
export async function readAssignmentListRows(
  after: ListPosition | null,
  limit: number,
): Promise<AssignmentListRow[]> {
  const rows = (
    await db().query<RawListRow>(
      `SELECT ${listColumns} FROM ai_assignments a
       WHERE $1::int IS NULL
         OR (CASE WHEN a.status='needs_attention' THEN 0 ELSE 1 END) > $1::int
         OR ((CASE WHEN a.status='needs_attention' THEN 0 ELSE 1 END) = $1::int
           AND (a.placed_at < $2::timestamptz
             OR (a.placed_at = $2::timestamptz AND a.id < $3::uuid)))
       ORDER BY "group",a.placed_at DESC,a.id DESC
       LIMIT $4`,
      [after?.group ?? null, after?.placedAt ?? null, after?.id ?? null, limit],
    )
  ).rows
  return rows.map(toListRow)
}

/** One assignment in the panel's order, without row locks; else null. */
export async function readAssignmentRow(
  id: string,
): Promise<AssignmentListRow | null> {
  const row = (
    await db().query<RawListRow>(
      `SELECT ${listColumns} FROM ai_assignments a WHERE a.id=$1`,
      [id],
    )
  ).rows[0]
  return row ? toListRow(row) : null
}

/** One operation as the details read it, without its result or exchange. */
export type OperationDetailsRow = {
  ordinal: number
  origin: OperationOrigin
  state: OperationState
  waitsFor: OperationWait | null
  pendingSince: Date
  startedAt: Date | null
  finishedAt: Date | null
  potentialCost: string | null
  actualCost: string | null
  actualCostUnknown: boolean
  cause: OperationCause | null
  retryable: boolean | null
}

/** The operations of an assignment from the first, without row locks. */
export async function readOperationDetailsRows(
  assignmentId: string,
): Promise<OperationDetailsRow[]> {
  return (
    await db().query<OperationDetailsRow>(
      `SELECT ordinal,origin,state,waits_for AS "waitsFor",
        pending_since AS "pendingSince",started_at AS "startedAt",
        finished_at AS "finishedAt",
        potential_cost::numeric(16,6)::text AS "potentialCost",
        actual_cost::numeric(16,6)::text AS "actualCost",
        (${unknownActualCost}) AS "actualCostUnknown",cause,retryable
       FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal`,
      [assignmentId],
    )
  ).rows
}

/** The frozen executor parameters of an assignment. */
export async function readExecutorParameters(
  assignmentId: string,
): Promise<Record<string, string | null>> {
  return (
    await db().query<{ parameters: Record<string, string | null> }>(
      'SELECT executor_parameters AS parameters FROM ai_assignments WHERE id=$1',
      [assignmentId],
    )
  ).rows[0]!.parameters
}

/** The number of assignments needing attention, without row locks. */
export async function countNeedingAttention(): Promise<number> {
  return (
    await db().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ai_assignments
       WHERE status='needs_attention'`,
    )
  ).rows[0]!.count
}
