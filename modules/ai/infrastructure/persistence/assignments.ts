import { db } from '../../../../lib/db.ts'
import type {
  AssignmentStatus,
  AssignmentType,
  ResponseFormat,
} from '../../assignments/assignment.ts'
import type { AgentTool } from '../../domain/execution-mode.ts'
import type { ExecutorParameters } from '../../executors/declaration.ts'
import type { OperationOrigin } from './operations.ts'

/** A new assignment with its frozen content, executor and parameters. */
export type NewAssignment = {
  id: string
  settingsName: string
  type: AssignmentType
  label: string
  instruction: string
  input: string
  responseFormat: ResponseFormat | null
  agentOptions: { tools: AgentTool[]; resultInstruction: string } | null
  executor: string
  executorParameters: ExecutorParameters
  automaticOperationLimit: number
  timeLimitSeconds: number
}

/**
 * Inserts an assignment in progress, placed now, with its deadline the time
 * limit after it.
 */
export async function insertAssignment(assignment: NewAssignment) {
  await db().query(
    `INSERT INTO ai_assignments(id,settings_name,type,label,instruction,input,
      response_format,agent_options,executor,executor_parameters,status,
      automatic_operation_limit,placed_at,deadline)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'in_progress',$11,now(),
      now()+make_interval(secs=>$12))`,
    [
      assignment.id,
      assignment.settingsName,
      assignment.type,
      assignment.label,
      assignment.instruction,
      assignment.input,
      assignment.responseFormat === null
        ? null
        : JSON.stringify(assignment.responseFormat),
      assignment.agentOptions === null
        ? null
        : JSON.stringify(assignment.agentOptions),
      assignment.executor,
      JSON.stringify(assignment.executorParameters),
      assignment.automaticOperationLimit,
      assignment.timeLimitSeconds,
    ],
  )
}

/** Inserts an operation pending since now, waiting for its executor. */
export async function insertPendingOperation(operation: {
  id: string
  assignmentId: string
  ordinal: number
  origin: OperationOrigin
}) {
  await db().query(
    `INSERT INTO ai_operations(id,assignment_id,ordinal,origin,state,waits_for,pending_since)
     VALUES($1,$2,$3,$4,'pending','executor',now())`,
    [operation.id, operation.assignmentId, operation.ordinal, operation.origin],
  )
}

/** The status of each of the assignments that exist, without row locks. */
export async function readStatuses(
  ids: readonly string[],
): Promise<Map<string, AssignmentStatus>> {
  if (!ids.length) return new Map()
  const rows = (
    await db().query<{ id: string; status: AssignmentStatus }>(
      'SELECT id,status FROM ai_assignments WHERE id=ANY($1::uuid[])',
      [ids],
    )
  ).rows
  return new Map(rows.map((row) => [row.id, row.status]))
}

/**
 * What decides the next step of an assignment after an operation ended: its
 * frozen executor, its limit of automatic operations, how many automatic
 * operations it has, the highest ordinal of its operations and its
 * deadline. The caller holds the lock on the assignment's row.
 */
export type AssignmentOperations = {
  executor: string
  automaticOperationLimit: number
  automaticOperations: number
  lastOrdinal: number
  deadline: Date
}

export async function readAssignmentOperations(
  assignmentId: string,
): Promise<AssignmentOperations> {
  return (
    await db().query<AssignmentOperations>(
      `SELECT a.executor,
        a.automatic_operation_limit AS "automaticOperationLimit",
        (count(o.id) FILTER (WHERE o.origin='automatic'))::int
          AS "automaticOperations",
        coalesce(max(o.ordinal),0)::int AS "lastOrdinal",a.deadline
       FROM ai_assignments a LEFT JOIN ai_operations o ON o.assignment_id=a.id
       WHERE a.id=$1 GROUP BY a.id`,
      [assignmentId],
    )
  ).rows[0]!
}

/**
 * Moves an assignment in progress to needs attention; false, with nothing
 * changed, when it is no longer in progress (ZA-R03).
 */
export async function setNeedsAttention(
  assignmentId: string,
): Promise<boolean> {
  const changed = await db().query(
    `UPDATE ai_assignments SET status='needs_attention'
     WHERE id=$1 AND status='in_progress'`,
    [assignmentId],
  )
  return changed.rowCount === 1
}

/** A succeeded operation whose assignment in progress awaits its delivery. */
export type ResultToDeliver = {
  assignmentId: string
  settingsName: string
  type: AssignmentType
  executor: string
  result: unknown
  executorState: unknown
}

/**
 * The result of a succeeded operation whose assignment is in progress, with
 * the assignment's row locked until the caller's transaction ends; null for
 * an unknown operation, one that has not succeeded, or an assignment no
 * longer in progress. The condition is checked again on the row as it is
 * once its lock is taken, so a concurrent end that saved first wins
 * (ZA-R03).
 */
export async function lockResultToDeliver(
  operationId: string,
): Promise<ResultToDeliver | null> {
  const row = (
    await db().query<ResultToDeliver>(
      `SELECT a.id AS "assignmentId",a.settings_name AS "settingsName",
        a.type,a.executor,o.result,o.executor_state AS "executorState"
       FROM ai_operations o JOIN ai_assignments a ON a.id=o.assignment_id
       WHERE o.id=$1 AND o.state='succeeded' AND a.status='in_progress'
       FOR UPDATE OF a`,
      [operationId],
    )
  ).rows[0]
  return row ?? null
}

/**
 * Ends an assignment in progress as succeeded at `at`; false, with nothing
 * changed, when it is no longer in progress (ZA-R03).
 */
export async function setSucceeded(
  assignmentId: string,
  at: Date,
): Promise<boolean> {
  const changed = await db().query(
    `UPDATE ai_assignments SET status='succeeded',finished_at=$2
     WHERE id=$1 AND status='in_progress'`,
    [assignmentId, at],
  )
  return changed.rowCount === 1
}

/**
 * The stored reasons of a failed assignment (solution design of epic sq2,
 * "Contract: the closed lists"; ZA-R05): rejected by the owner, time limit
 * exceeded, result not taken.
 */
export type FailureReason = 'rejected' | 'time_limit' | 'delivery_failed'

/**
 * Ends an assignment in progress as failed with the reason at `at`; false,
 * with nothing changed, when it is no longer in progress (ZA-R03).
 */
export async function setFailedInProgress(
  assignmentId: string,
  reason: FailureReason,
  at: Date,
): Promise<boolean> {
  const changed = await db().query(
    `UPDATE ai_assignments SET status='failed',failure_reason=$2,finished_at=$3
     WHERE id=$1 AND status='in_progress'`,
    [assignmentId, reason, at],
  )
  return changed.rowCount === 1
}

/**
 * The condition, on an assignment row `a`, of one the time limit fails at
 * `$now` (T6-R07): in progress or needing attention, its deadline reached,
 * no running operation, and, while in progress, no succeeded operation
 * whose delivery is still to be made.
 */
const pastTimeLimit = `a.status IN ('in_progress','needs_attention')
  AND a.deadline<=$1
  AND NOT EXISTS(SELECT 1 FROM ai_operations o
    WHERE o.assignment_id=a.id AND (o.state='running'
      OR (o.state='succeeded' AND a.status='in_progress')))`

/** The assignments the time limit fails at `now`, oldest deadline first. */
export async function assignmentsPastTimeLimit(now: Date): Promise<string[]> {
  return (
    await db().query<{ id: string }>(
      `SELECT a.id FROM ai_assignments a WHERE ${pastTimeLimit}
       ORDER BY a.deadline,a.id`,
      [now],
    )
  ).rows.map((row) => row.id)
}

/**
 * Locks the assignment's row and, when the time limit still applies to it
 * at `now`, ends it as failed with the reason `time_limit`. Returns its
 * settings name, or null with nothing changed. An operation starts only
 * with the assignment's row locked, so none starts between the check and
 * the write.
 */
export async function failPastTimeLimit(
  assignmentId: string,
  now: Date,
): Promise<{ settingsName: string } | null> {
  await db().query('SELECT 1 FROM ai_assignments WHERE id=$1 FOR UPDATE', [
    assignmentId,
  ])
  const row = (
    await db().query<{ settingsName: string }>(
      `UPDATE ai_assignments a SET status='failed',failure_reason='time_limit',
        finished_at=$1
       WHERE a.id=$2 AND ${pastTimeLimit}
       RETURNING a.settings_name AS "settingsName"`,
      [now, assignmentId],
    )
  ).rows[0]
  return row ?? null
}
