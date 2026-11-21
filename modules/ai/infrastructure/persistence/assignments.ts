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
