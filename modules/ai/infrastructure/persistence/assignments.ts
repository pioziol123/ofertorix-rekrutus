import { db } from '../../../../lib/db.ts'
import type {
  AssignmentStatus,
  AssignmentType,
  ResponseFormat,
} from '../../assignments/assignment.ts'
import type { AgentTool } from '../../domain/execution-mode.ts'
import type { ExecutorParameters } from '../../executors/declaration.ts'

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
  origin: 'automatic' | 'manual'
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
 * operations it has and the highest ordinal of its operations. The caller
 * holds the lock on the assignment's row.
 */
export type AssignmentOperations = {
  executor: string
  automaticOperationLimit: number
  automaticOperations: number
  lastOrdinal: number
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
        coalesce(max(o.ordinal),0)::int AS "lastOrdinal"
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
