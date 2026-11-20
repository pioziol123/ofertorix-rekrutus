import { db } from '../../../../lib/db.ts'
import { AiRequestError } from '../../errors.ts'
import type {
  ExecutionMode,
  ExecutionSettings,
} from '../../execution-settings.ts'
import type { AgentTool } from '../../domain/execution-mode.ts'
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
  tools: AgentTool[]
  /**
   * How an agent writes its result from its materials (agent mode).
   * ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
   */
  resultInstruction?: string
  /**
   * What the adapter fixed with its check before the request; only the
   * adapter reads it. Absent in snapshots saved before the check existed.
   */
  fixed?: Record<string, unknown>
  /**
   * The client asked to keep the exact request and raw response of a
   * single-mode execution. Absent when it did not ask.
   */
  keepArchive?: boolean
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
  /** The adapter's own state; only the adapter reads it. */
  adapterState: unknown
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
    // ASSUMPTION(oferty-pracy-0mq.22/ASM-4): the calls of a paid tool.
    tool_calls?: number | null
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
    adapterState: row.adapter_state ?? null,
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
        ? {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            ...(usage.tool_calls !== undefined
              ? { toolCalls: usage.tool_calls }
              : {}),
          }
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
  // attempts carry their own operation type, apart from the attempts the
  // former paths of the clients saved.
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
 * against the same execution being picked up twice; exclusivity in the
 * queue keeps a second job of its kind from running meanwhile (B6-D01).
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
      // ASSUMPTION(oferty-pracy-0mq.22/ASM-4): the calls of a paid tool.
      ...(settlement.usage.toolCalls !== undefined
        ? { tool_calls: settlement.usage.toolCalls }
        : {}),
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
 * delivered. The execution waits for delivery. Only an execution in one of
 * the `from` states, running by default, takes an outcome, in the same
 * statement, so of a late process's save and an end saved meanwhile
 * exactly one succeeds (B6-R06); false when it is in no such state.
 */
export async function saveOutcome(
  executionId: string,
  outcome: { result: unknown; end: ExecutionEnd | null },
  settlement: Settlement,
  from: readonly ('queued' | 'running')[] = ['running'],
): Promise<boolean> {
  const saved = await db().query(
    `UPDATE ai_executions SET state='delivering',result=$2,cause=$3,end_state=$4,revision=revision+1 WHERE id=$1 AND state=ANY($5::text[])`,
    [
      executionId,
      outcome.result === null ? null : JSON.stringify(outcome.result),
      outcome.end?.cause ?? null,
      outcome.end?.state ?? null,
      from,
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
 * Saves the adapter's own state of a running execution; false when the
 * execution no longer runs. The value is stored as it is, never read here.
 * It is what an agent saves step by step.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
 */
export async function saveAdapterState(executionId: string, state: unknown) {
  const saved = await db().query(
    "UPDATE ai_executions SET adapter_state=$2::jsonb,revision=revision+1 WHERE id=$1 AND state='running'",
    [executionId, JSON.stringify(state)],
  )
  return (saved.rowCount ?? 0) > 0
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

/** Ends a running execution as retried; false when it no longer runs. */
export async function finishRunning(
  executionId: string,
  cause: ExecutionCause | null,
) {
  const finished = await db().query(
    "UPDATE ai_executions SET state='retried',cause=$2,end_state=NULL,finished_at=now(),revision=revision+1 WHERE id=$1 AND state='running'",
    [executionId, cause],
  )
  return (finished.rowCount ?? 0) > 0
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

export async function executionsInState(state: 'waiting_budget') {
  const rows = await db().query(
    `${selectExecution} WHERE e.state=$1 ORDER BY e.created_at,e.id`,
    [state],
  )
  return rows.rows.map(toExecution)
}

/**
 * The executions that wait for work, run or wait for delivery, in the
 * order they were requested.
 */
export async function unfinishedExecutions() {
  const rows = await db().query(
    `${selectExecution} WHERE e.state IN ('queued','running','delivering') ORDER BY e.created_at,e.id`,
  )
  return rows.rows.map(toExecution)
}

/**
 * Whether a provider batch group was already requested. Takes the group's
 * turn until the caller's transaction ends, so two requests of one group
 * are admitted one at a time. ASSUMPTION(oferty-pracy-0mq.21/ASM-7)
 */
export async function groupRequested(groupId: string) {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `ai-group-${groupId}`,
  ])
  const rows = await db().query(
    "SELECT 1 FROM ai_executions WHERE group_id=$1 AND mode='batch' LIMIT 1",
    [groupId],
  )
  return (rows.rowCount ?? 0) > 0
}

/**
 * The latest execution of each given operation.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-4): exists only for readLatestExecutions.
 */
export async function readLatestExecutionRows(operationIds: string[]) {
  const rows = await db().query(
    `SELECT DISTINCT ON (e.operation_id) e.*,a.id AS attempt_id,a.attempt,a.generation,a.state AS attempt_state,a.month,
      a.reserved_pln,a.actual_pln,a.usage FROM ai_executions e JOIN ai_attempts a ON a.execution_id=e.id
     WHERE e.operation_id=ANY($1::uuid[]) AND e.state IS NOT NULL
     ORDER BY e.operation_id,e.created_at DESC,a.attempt DESC`,
    [operationIds],
  )
  return rows.rows.map(toExecution)
}

/**
 * How many executions of a settings key are in progress.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-4): exists only for countActiveExecutions.
 */
export async function countActiveExecutionRows(settingsKey: string) {
  const row = (
    await db().query(
      `SELECT count(*)::int AS n FROM ai_executions WHERE settings_key=$1 AND state IN ${inProgress}`,
      [settingsKey],
    )
  ).rows[0]
  return Number(row?.n ?? 0)
}

/**
 * Takes the queued executions of a batch group for work, all in one
 * statement, so that only one run sends the group. Returns how many it
 * took.
 */
export async function claimGroup(groupId: string) {
  const claimed = await db().query(
    `UPDATE ai_executions SET state='running',revision=revision+1
     WHERE group_id=$1 AND mode='batch' AND state='queued'`,
    [groupId],
  )
  return claimed.rowCount ?? 0
}

/** The running executions of a batch group. */
export async function runningGroupRows(groupId: string) {
  const rows = await db().query(
    `${selectExecution} WHERE e.group_id=$1 AND e.mode='batch' AND e.state='running' ORDER BY e.id`,
    [groupId],
  )
  return rows.rows.map(toExecution)
}

/**
 * Saves the adapter's state of a group when it still holds the state the
 * caller read; false when another run changed it since. The run that
 * took the group (`claimed`) saves only while its items still run, so a
 * group ended meanwhile is not sent further. The value is compared and
 * stored as it is, never interpreted.
 */
export async function saveGroupAdapterState(
  groupId: string,
  expected: unknown,
  next: unknown,
  claimed = false,
) {
  const saved = await db().query(
    `UPDATE ai_executions SET adapter_state=$3::jsonb,revision=revision+1
     WHERE group_id=$1 AND mode='batch' AND adapter_state IS NOT DISTINCT FROM $2::jsonb${claimed ? " AND state='running'" : ''}`,
    [
      groupId,
      expected === null ? null : JSON.stringify(expected),
      JSON.stringify(next),
    ],
  )
  return (saved.rowCount ?? 0) > 0
}

/** The adapter's state and settings of a batch group that has one. */
export async function readGroupAdapterState(groupId: string) {
  const row = (
    await db().query(
      `SELECT adapter_state,configuration FROM ai_executions
       WHERE group_id=$1 AND mode='batch' AND adapter_state IS NOT NULL LIMIT 1`,
      [groupId],
    )
  ).rows[0]
  return row
    ? {
        state: row.adapter_state as unknown,
        snapshot: row.configuration as ExecutionSnapshot,
      }
    : null
}

/**
 * Batch groups with work left for their next step: each group that still
 * has a running item (to poll it), and the adapter state of each ended
 * group that has one (the adapter says whether it needs cleaning up).
 */
export async function batchGroupsInProgress() {
  const rows = await db().query(
    `SELECT DISTINCT group_id FROM ai_executions
     WHERE mode='batch' AND state='running' ORDER BY group_id`,
  )
  return rows.rows.map((row) => row.group_id as string)
}

export async function endedBatchGroups() {
  const rows = await db().query(
    `SELECT DISTINCT ON (group_id) group_id FROM ai_executions e
     WHERE mode='batch' AND adapter_state IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ai_executions r WHERE r.group_id=e.group_id AND r.mode='batch' AND r.state IN ('queued','running'))
     ORDER BY group_id`,
  )
  return rows.rows.map((row) => row.group_id as string)
}
