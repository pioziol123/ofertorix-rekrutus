import { db } from '../../../../lib/db.ts'
import { AiRequestError } from '../../errors.ts'
import type {
  ExecutionMode,
  ExecutionSettings,
} from '../../execution-settings.ts'
import type { ModelUsage } from '../../provider-adapter.ts'
import {
  inProgressStates,
  type ExecutionCause,
  type ExecutionEnd,
  type ExecutionState,
} from '../../domain/execution-state.ts'

export type { ExecutionState } from '../../domain/execution-state.ts'

/** What AI fixes at request time: the settings and the work to send. */
export type ExecutionSnapshot = {
  kind: 'ai-execution'
  settings: ExecutionSettings
  instruction: string
  responseSchema: { name: string; schema: Record<string, unknown> }
  input: string
  tools: string[]
  /**
   * What the adapter fixed with its check before the request; only the
   * adapter reads it. Absent in snapshots saved before the check existed.
   */
  fixed?: Record<string, unknown>
}

const inProgress = `(${inProgressStates.map((s) => `'${s}'`).join(',')})`

export type ExecutionRow = {
  id: string
  settingsKey: string
  operationId: string
  inputVersion: string | null
  mode: ExecutionMode
  groupId: string | null
  supersedes: string | null
  state: ExecutionState
  snapshot: ExecutionSnapshot
  /** The saved result, or null when the execution has none. */
  result: unknown
  cause: ExecutionCause | null
  /** The end an adapter decided for an outcome without a result. */
  endState: ExecutionEnd['state'] | null
  /** The client's reason for rejecting the result. */
  rejectionReason: string | null
  delivery: { attempts: number; error: string | null }
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
    settingsKey: row.settings_key as string,
    operationId: row.operation_id as string,
    inputVersion: row.input_version as string | null,
    mode: row.mode as ExecutionMode,
    groupId: row.group_id as string | null,
    supersedes: row.supersedes as string | null,
    state: row.state as ExecutionState,
    snapshot: row.configuration as ExecutionSnapshot,
    result: row.result ?? null,
    cause: row.cause as ExecutionCause | null,
    endState: row.end_state as ExecutionEnd['state'] | null,
    rejectionReason: row.rejection_reason as string | null,
    delivery: {
      attempts: row.delivery_attempts as number,
      error: row.delivery_error as string | null,
    },
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
    `SELECT 1 FROM ai_executions WHERE operation_id=$1 AND state IN ${inProgress}`,
    [operationId],
  )
  return (active.rowCount ?? 0) > 0
}

export type NewExecution = {
  id: string
  settingsKey: string
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
    /**
     * The funded month and reservation, or null while waiting for budget.
     * Work that costs nothing is funded without a month.
     */
    funding: { month: string | null; reserved: string } | null
  }
}

function isActiveExecutionConflict(error: unknown) {
  const details = error as { code?: string; constraint?: string } | null
  return (
    details?.code === '23505' &&
    details.constraint === 'ai_one_active_execution'
  )
}

/** Saves an execution with its attempt, the settlement record. */
export async function insertExecution(
  execution: NewExecution,
): Promise<'queued' | 'waiting_budget'> {
  const state = execution.attempt.funding ? 'queued' : 'waiting_budget'
  try {
    await db().query(
      `INSERT INTO ai_executions(id,settings_key,operation_id,supersedes,configuration,publication_token,state,mode,group_id,input_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        execution.id,
        execution.settingsKey,
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
  } catch (error) {
    // A concurrent request of the same operation won the race.
    if (isActiveExecutionConflict(error))
      throw new AiRequestError('operation_busy')
    throw error
  }
  // The attempt is the settlement record only. Its state is the settlement
  // status ('open', then 'settled' or 'unknown'), never the execution's
  // stage, which lives in the execution's state and cause alone. General
  // attempts carry their own operation type, so the paths that still read
  // attempts by Profile, Matching or Companies never pick them.
  await db().query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration,execution_id)
     VALUES($1,NULL,0,$2,$3,$4,'execution','open',$5,$6,$7)`,
    [
      execution.attempt.id,
      execution.attempt.funding?.month ?? null,
      execution.attempt.number,
      execution.attempt.generation,
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
    'UPDATE ai_attempts SET month=$2,reserved_pln=$3 WHERE execution_id=$1',
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
    "UPDATE ai_executions SET state='running',revision=revision+1 WHERE id=$1 AND state='queued' RETURNING id",
    [executionId],
  )
  return claimed.rowCount ? readExecutionRow(executionId) : null
}

export type Settlement = {
  /** The confirmed cost, or null when the cost is unknown and stays reserved. */
  actual: string | null
  usage: ModelUsage
  responseId: string | null
}

const attemptOutcome = 'actual_pln=$2,usage=$3,response_id=$4,finished_at=now()'
function attemptValues(executionId: string, settlement: Settlement) {
  return [
    executionId,
    settlement.actual,
    {
      input_tokens: settlement.usage.inputTokens,
      output_tokens: settlement.usage.outputTokens,
    },
    settlement.responseId,
  ]
}

/** Settles the attempt of an execution; the month of the attempt stays. */
export async function settleAttempt(
  executionId: string,
  settlement: Settlement,
) {
  await db().query(
    `UPDATE ai_attempts SET state=CASE WHEN $2::numeric IS NULL THEN 'unknown' ELSE 'settled' END,${attemptOutcome} WHERE execution_id=$1`,
    attemptValues(executionId, settlement),
  )
}

/**
 * Saves what the provider returned and the cost it implies, without
 * settling: the attempt keeps its reservation until the outcome is
 * delivered. The execution waits for delivery. Only a running execution
 * takes an outcome; false when it no longer runs.
 */
export async function saveOutcome(
  executionId: string,
  outcome: { result: unknown; end: ExecutionEnd | null },
  settlement: Settlement,
): Promise<boolean> {
  const saved = await db().query(
    "UPDATE ai_executions SET state='delivering',result=$2,cause=$3,end_state=$4,revision=revision+1 WHERE id=$1 AND state='running'",
    [
      executionId,
      outcome.result === null ? null : JSON.stringify(outcome.result),
      outcome.end?.cause ?? null,
      outcome.end?.state ?? null,
    ],
  )
  if (!saved.rowCount) return false
  await db().query(
    `UPDATE ai_attempts SET ${attemptOutcome} WHERE execution_id=$1`,
    attemptValues(executionId, settlement),
  )
  return true
}

/**
 * Takes an execution waiting for delivery and counts the delivery attempt.
 * The row stays locked until the transaction ends, so a second delivery
 * of the same execution waits and then finds it delivered.
 */
export async function claimDelivery(executionId: string) {
  const claimed = await db().query(
    "UPDATE ai_executions SET delivery_attempts=delivery_attempts+1 WHERE id=$1 AND state='delivering' RETURNING id",
    [executionId],
  )
  return claimed.rowCount ? readExecutionRow(executionId) : null
}

/** Settles the saved cost: known costs are charged, unknown stay reserved. */
export async function settleSavedAttempt(executionId: string) {
  await db().query(
    "UPDATE ai_attempts SET state=CASE WHEN actual_pln IS NULL THEN 'unknown' ELSE 'settled' END WHERE execution_id=$1",
    [executionId],
  )
}

/** Records a delivery that did not reach the client's decision. */
export async function recordFailedDelivery(executionId: string, error: string) {
  await db().query(
    "UPDATE ai_executions SET delivery_attempts=delivery_attempts+1,delivery_error=$2 WHERE id=$1 AND state='delivering'",
    [executionId, error],
  )
}

/**
 * Ends an execution. The end an adapter decided is kept in `end_state`
 * only while the outcome waits for delivery; once the execution ends,
 * `state` and `cause` are its only record, so the pending end is cleared.
 */
export async function finishExecution(
  executionId: string,
  outcome: {
    state: 'completed' | 'rejected' | 'failed' | 'uncertain' | 'retried'
    cause: ExecutionCause | null
    /** The client's reason for rejecting the result. */
    rejectionReason?: string
  },
) {
  await db().query(
    'UPDATE ai_executions SET state=$2,cause=$3,rejection_reason=$4,end_state=NULL,finished_at=now(),revision=revision+1 WHERE id=$1',
    [
      executionId,
      outcome.state,
      outcome.cause,
      outcome.rejectionReason?.slice(0, 500) ?? null,
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

/** The latest execution of an operation, or null when it has none. */
export async function readLatestExecutionRow(operationId: string) {
  const row = (
    await db().query(
      `${selectExecution} WHERE e.operation_id=$1 AND e.state IS NOT NULL ORDER BY e.created_at DESC,a.attempt DESC LIMIT 1`,
      [operationId],
    )
  ).rows[0]
  return row ? toExecution(row) : null
}

export async function executionsInState(state: 'waiting_budget' | 'queued') {
  const rows = await db().query(
    `${selectExecution} WHERE e.state=$1 ORDER BY e.created_at,e.id`,
    [state],
  )
  return rows.rows.map(toExecution)
}
