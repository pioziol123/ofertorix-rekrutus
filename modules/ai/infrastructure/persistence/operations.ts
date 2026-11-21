import { db } from '../../../../lib/db.ts'
import type {
  AssignmentType,
  ResponseFormat,
} from '../../assignments/assignment.ts'
import type { AgentTool } from '../../domain/execution-mode.ts'
import type { ExecutorParameters } from '../../executors/declaration.ts'

/** A running operation with the frozen content of its assignment. */
export type RunningOperation = {
  id: string
  executor: string
  type: AssignmentType
  instruction: string
  input: string
  responseFormat: ResponseFormat | null
  agentOptions: { tools: AgentTool[]; resultInstruction: string } | null
  executorParameters: ExecutorParameters
  executorState: unknown
}

/** The operation when it runs, with its assignment's content; else null. */
export async function readRunningOperation(
  id: string,
): Promise<RunningOperation | null> {
  const row = (
    await db().query<RunningOperation>(
      `SELECT o.id,a.executor,a.type,a.instruction,a.input,
        a.response_format AS "responseFormat",a.agent_options AS "agentOptions",
        a.executor_parameters AS "executorParameters",
        o.executor_state AS "executorState"
       FROM ai_operations o JOIN ai_assignments a ON a.id=o.assignment_id
       WHERE o.id=$1 AND o.state='running'`,
      [id],
    )
  ).rows[0]
  return row ?? null
}

/**
 * Appends a request or a raw response to the operation's exchange, while
 * the operation runs; false, with nothing written, when it no longer runs.
 * The operation's row is locked, so the sequence follows the writes.
 */
export async function appendExchange(
  operationId: string,
  kind: 'request' | 'response',
  content: string,
): Promise<boolean> {
  const running = await db().query(
    `SELECT 1 FROM ai_operations WHERE id=$1 AND state='running' FOR UPDATE`,
    [operationId],
  )
  if (!running.rowCount) return false
  await db().query(
    `INSERT INTO ai_operation_exchange(operation_id,sequence,kind,content)
     SELECT $1,COALESCE(MAX(sequence),0)+1,$2,$3
     FROM ai_operation_exchange WHERE operation_id=$1`,
    [operationId, kind, content],
  )
  return true
}

/**
 * Replaces the executor state of the operation while it runs; false when
 * it no longer runs.
 */
export async function saveExecutorState(
  operationId: string,
  state: unknown,
): Promise<boolean> {
  const saved = await db().query(
    `UPDATE ai_operations SET executor_state=$2
     WHERE id=$1 AND state='running'`,
    [operationId, JSON.stringify(state)],
  )
  return saved.rowCount === 1
}
