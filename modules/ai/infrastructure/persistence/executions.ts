import { db } from '../../../../lib/db.ts'
import type {
  AiJobType,
  ExecutionMode,
  ExecutionSettings,
} from '../../execution-settings.ts'
import type { ModelUsage } from '../../provider-adapter.ts'

/** What AI fixes at request time: the settings and the work to send. */
export type ExecutionSnapshot = {
  kind: 'ai-execution'
  settings: ExecutionSettings
  instruction: string
  responseSchema: { name: string; schema: Record<string, unknown> }
  input: string
  tools: string[]
}

export type ExecutionState =
  | 'waiting_budget'
  | 'queued'
  | 'running'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'retried'

export type ExecutionRow = {
  id: string
  jobType: AiJobType
  operationId: string
  inputVersion: string | null
  mode: ExecutionMode
  groupId: string | null
  supersedes: string | null
  state: ExecutionState
  snapshot: ExecutionSnapshot
  result: unknown
  cause: string | null
  createdAt: Date
  finishedAt: Date | null
  attempt: {
    id: string
    number: number
    generation: string
    state: string
    month: string | null
    reserved: string
    actual: string | null
    usage: ModelUsage | null
  }
}

const selectExecution = `SELECT e.*,a.id AS attempt_id,a.attempt,a.generation,a.state AS attempt_state,a.month,
 a.reserved_pln,a.actual_pln,a.usage FROM ai_executions e JOIN ai_attempts a ON a.execution_id=e.id`

function toExecution(row: Record<string, unknown>): ExecutionRow {
  const usage = row.usage as {
    input_tokens: number | null
    output_tokens: number | null
  } | null
  return {
    id: row.id as string,
    jobType: row.task_type as AiJobType,
    operationId: row.operation_id as string,
    inputVersion: row.input_version as string | null,
    mode: row.mode as ExecutionMode,
    groupId: row.group_id as string | null,
    supersedes: row.supersedes as string | null,
    state: row.state as ExecutionState,
    snapshot: row.configuration as ExecutionSnapshot,
    result: row.result ?? null,
    cause: row.cause as string | null,
    createdAt: row.created_at as Date,
    finishedAt: row.finished_at as Date | null,
    attempt: {
      id: row.attempt_id as string,
      number: row.attempt as number,
      generation: row.generation as string,
      state: row.attempt_state as string,
      month: row.month as string | null,
      reserved: row.reserved_pln as string,
      actual: row.actual_pln as string | null,
      usage: usage
        ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
        : null,
    },
  }
}

export async function hasActiveExecution(operationId: string) {
  const active = await db().query(
    "SELECT 1 FROM ai_executions WHERE operation_id=$1 AND state IN ('waiting_budget','queued','running')",
    [operationId],
  )
  return (active.rowCount ?? 0) > 0
}

export type NewExecution = {
  id: string
  jobType: AiJobType
  operationId: string
  inputVersion: string | null
  mode: ExecutionMode
  groupId: string | null
  supersedes: string | null
  snapshot: ExecutionSnapshot
  publicationToken: string
  attempt: {
    id: string
    number: number
    generation: string
    /** The funded month and reservation, or null while waiting for budget. */
    funding: { month: string; reserved: string } | null
  }
}

/** Saves an execution with its attempt, the settlement record. */
export async function insertExecution(execution: NewExecution) {
  const state = execution.attempt.funding ? 'queued' : 'waiting_budget'
  await db().query(
    `INSERT INTO ai_executions(id,task_type,operation_id,supersedes,configuration,publication_token,state,mode,group_id,input_version)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      execution.id,
      execution.jobType,
      execution.operationId,
      execution.supersedes,
      execution.snapshot,
      execution.publicationToken,
      state,
      execution.mode,
      execution.groupId,
      execution.inputVersion,
    ],
  )
  // General attempts carry their own operation type, so the paths that
  // still read attempts by Profile, Matching or Companies never pick them.
  await db().query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration,execution_id)
     VALUES($1,NULL,0,$2,$3,$4,'execution',$5,$6,$7,$8)`,
    [
      execution.attempt.id,
      execution.attempt.funding?.month ?? null,
      execution.attempt.number,
      execution.attempt.generation,
      state,
      execution.attempt.funding?.reserved ?? '0',
      execution.snapshot.settings,
      execution.id,
    ],
  )
  return state
}

/** Moves a waiting execution to the queue with its reservation. */
export async function fundExecution(
  executionId: string,
  funding: { month: string; reserved: string },
) {
  const funded = await db().query(
    "UPDATE ai_executions SET state='queued',revision=revision+1 WHERE id=$1 AND state='waiting_budget' RETURNING id",
    [executionId],
  )
  if (!funded.rowCount) return false
  await db().query(
    "UPDATE ai_attempts SET state='queued',month=$2,reserved_pln=$3 WHERE execution_id=$1",
    [executionId, funding.month, funding.reserved],
  )
  return true
}

/**
 * Takes a queued execution for work. The conditional state change protects
 * against the same execution being picked up twice.
 */
export async function claimExecution(executionId: string) {
  const claimed = await db().query(
    "UPDATE ai_executions SET state='running',runtime_state='running',runtime_observed_at=now(),revision=revision+1 WHERE id=$1 AND state='queued' RETURNING id",
    [executionId],
  )
  if (!claimed.rowCount) return null
  await db().query(
    "UPDATE ai_attempts SET state='running' WHERE execution_id=$1",
    [executionId],
  )
  return readExecutionRow(executionId)
}

export type Settlement = {
  /** The confirmed cost, or null when the cost is unknown and stays reserved. */
  actual: string | null
  usage: ModelUsage
  responseId: string | null
  error: string | null
}

/** Settles the attempt of an execution; the month of the attempt stays. */
export async function settleAttempt(
  executionId: string,
  settlement: Settlement,
) {
  await db().query(
    'UPDATE ai_attempts SET state=$2,actual_pln=$3,usage=$4,response_id=$5,error=$6,finished_at=now() WHERE execution_id=$1',
    [
      executionId,
      settlement.actual === null ? 'unknown' : 'settled',
      settlement.actual,
      {
        input_tokens: settlement.usage.inputTokens,
        output_tokens: settlement.usage.outputTokens,
      },
      settlement.responseId,
      settlement.error,
    ],
  )
}

export async function finishExecution(
  executionId: string,
  outcome: {
    state: 'completed' | 'rejected' | 'failed' | 'retried'
    result: unknown
    cause: string | null
  },
) {
  await db().query(
    "UPDATE ai_executions SET state=$2,result=$3,cause=$4,runtime_state='finished',result_status=$5,finished_at=now(),revision=revision+1 WHERE id=$1",
    [
      executionId,
      outcome.state,
      outcome.result === null ? null : JSON.stringify(outcome.result),
      outcome.cause,
      outcome.result === null ? 'failed' : 'completed',
    ],
  )
}

export async function readExecutionRow(executionId: string) {
  const row = (
    await db().query(
      `${selectExecution} WHERE e.id=$1 AND e.state IS NOT NULL`,
      [executionId],
    )
  ).rows[0]
  return row ? toExecution(row) : null
}

export async function readOperationExecutionRows(operationId: string) {
  const rows = await db().query(
    `${selectExecution} WHERE e.operation_id=$1 AND e.state IS NOT NULL ORDER BY e.created_at,a.attempt`,
    [operationId],
  )
  return rows.rows.map(toExecution)
}

export async function executionsInState(state: 'waiting_budget' | 'queued') {
  const rows = await db().query(
    `${selectExecution} WHERE e.state=$1 ORDER BY e.created_at,e.id`,
    [state],
  )
  return rows.rows.map(toExecution)
}
