import { db } from '../../../../lib/db.ts'
import type {
  AssignmentStatus,
  AssignmentType,
  ResponseFormat,
} from '../../domain/assignment.ts'
import type { AgentTool } from '../../domain/agent-tools.ts'
import type {
  EndedOperationState,
  OperationCause,
  OperationOrigin,
  OperationState,
  OperationWait,
} from '../../domain/operation.ts'
import type { ExecutorParameters } from '../../ports/executor.ts'
import type { PriceList } from '../../domain/price-list.ts'
import type { ExecutorUsage } from '../../domain/usage.ts'

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

/** One entry of an operation's exchange, with its operation's ordinal. */
export type ExchangeRow = {
  ordinal: number
  sequence: number
  kind: 'request' | 'response'
  content: string
}

/**
 * Whether the assignment exists, and the exchange of each of its
 * operations, by the operations' ordinal and then the order of writing;
 * without row locks.
 */
export async function readExchangeOfAssignment(
  assignmentId: string,
): Promise<{ exists: boolean; operations: number[]; rows: ExchangeRow[] }> {
  const operations = (
    await db().query<{ ordinal: number }>(
      'SELECT ordinal FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal',
      [assignmentId],
    )
  ).rows.map((row) => row.ordinal)
  const exists =
    operations.length > 0 ||
    ((
      await db().query('SELECT 1 FROM ai_assignments WHERE id=$1', [
        assignmentId,
      ])
    ).rowCount ?? 0) > 0
  const rows = (
    await db().query<ExchangeRow>(
      `SELECT o.ordinal,e.sequence,e.kind,e.content
       FROM ai_operation_exchange e JOIN ai_operations o ON o.id=e.operation_id
       WHERE o.assignment_id=$1 ORDER BY o.ordinal,e.sequence`,
      [assignmentId],
    )
  ).rows
  return { exists, operations, rows }
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

/** An operation's state and what its start needs of its assignment. */
export type OperationToStart = {
  id: string
  assignmentId: string
  state: OperationState
  waitsFor: OperationWait | null
  origin: OperationOrigin
  assignmentStatus: AssignmentStatus
  executor: string
  type: AssignmentType
  executorParameters: ExecutorParameters
}

/**
 * The operation with its assignment's status and frozen executor; null for
 * an unknown one. The assignment's row and then the operation's are locked
 * until the caller's transaction ends, in the order the end of an
 * operation locks them.
 */
export async function lockOperationToStart(
  id: string,
): Promise<OperationToStart | null> {
  await db().query(
    `SELECT 1 FROM ai_assignments
     WHERE id=(SELECT assignment_id FROM ai_operations WHERE id=$1)
     FOR UPDATE`,
    [id],
  )
  const row = (
    await db().query<OperationToStart>(
      `SELECT o.id,o.assignment_id AS "assignmentId",o.state,
        o.waits_for AS "waitsFor",o.origin,
        a.status AS "assignmentStatus",a.executor,a.type,
        a.executor_parameters AS "executorParameters"
       FROM ai_operations o JOIN ai_assignments a ON a.id=o.assignment_id
       WHERE o.id=$1 FOR UPDATE OF o`,
      [id],
    )
  ).rows[0]
  return row ?? null
}

/**
 * Sets a pending operation running with its potential cost, its budget
 * month (null for free work) and the price list used.
 */
export async function setRunning(
  id: string,
  start: {
    potentialCost: string
    budgetMonth: string | null
    priceList: PriceList | null
    startedAt: Date
  },
): Promise<void> {
  await db().query(
    `UPDATE ai_operations SET state='running',waits_for=NULL,
      potential_cost=$2,budget_month=$3,price_list=$4,started_at=$5
     WHERE id=$1 AND state='pending'`,
    [
      id,
      start.potentialCost,
      start.budgetMonth,
      start.priceList === null ? null : JSON.stringify(start.priceList),
      start.startedAt,
    ],
  )
}

/**
 * Moves a pending operation from one wait to the other: from its executor
 * to the budget, or back. False, with nothing changed, when it no longer
 * waits for `from`.
 */
export async function changeWait(
  id: string,
  from: OperationWait,
  to: OperationWait,
): Promise<boolean> {
  const changed = await db().query(
    `UPDATE ai_operations SET waits_for=$3
     WHERE id=$1 AND state='pending' AND waits_for=$2`,
    [id, from, to],
  )
  return changed.rowCount === 1
}

/**
 * Ends a pending operation that never started as failed with the cause
 * `not_started`, not to be retried; it charges nothing.
 */
export async function endNotStarted(id: string, at: Date): Promise<void> {
  await db().query(
    `UPDATE ai_operations SET state='failed',waits_for=NULL,
      cause='not_started',retryable=false,finished_at=$2
     WHERE id=$1 AND state='pending'`,
    [id, at],
  )
}

/**
 * The pending operations of an assignment with their origin, their rows
 * locked until the caller's transaction ends, in the order of their
 * ordinals.
 */
export async function lockPendingOperations(
  assignmentId: string,
): Promise<{ id: string; origin: OperationOrigin }[]> {
  return (
    await db().query<{ id: string; origin: OperationOrigin }>(
      `SELECT id,origin FROM ai_operations
       WHERE assignment_id=$1 AND state='pending'
       ORDER BY ordinal FOR UPDATE`,
      [assignmentId],
    )
  ).rows
}

/**
 * Ends a pending operation whose background work failed finally before it
 * started as an ordinary failure with the cause `unknown`: retryable, with
 * no cost and no budget month, so it charges nothing (T4-R06).
 */
export async function endPendingAsFailed(id: string, at: Date): Promise<void> {
  await db().query(
    `UPDATE ai_operations SET state='failed',waits_for=NULL,
      cause='unknown',retryable=true,finished_at=$2
     WHERE id=$1 AND state='pending'`,
    [id, at],
  )
}

/**
 * Ends a running operation whose work stopped without an outcome as
 * uncertain with the cause `unknown` (T5-R01): its actual cost stays
 * unknown and its potential cost and budget month stay, so the potential
 * cost stays charged to its month (T5-R02, ZA-R04). False, with nothing
 * changed, when it no longer runs.
 */
export async function endRunningAsUncertain(
  id: string,
  at: Date,
): Promise<boolean> {
  const ended = await db().query(
    `UPDATE ai_operations SET state='uncertain',cause='unknown',
      retryable=NULL,actual_cost=NULL,finished_at=$2
     WHERE id=$1 AND state='running'`,
    [id, at],
  )
  return ended.rowCount === 1
}

/** A running operation about to end, with its assignment's status. */
export type OperationToEnd = {
  assignmentId: string
  assignmentStatus: AssignmentStatus
  origin: OperationOrigin
  priceList: PriceList | null
}

/**
 * Locks the operation's assignment and then the operation while it runs,
 * until the caller's transaction ends; null when it does not run.
 */
export async function lockRunningToEnd(
  id: string,
): Promise<OperationToEnd | null> {
  const assignment = (
    await db().query<{
      assignmentId: string
      assignmentStatus: AssignmentStatus
    }>(
      `SELECT a.id AS "assignmentId",a.status AS "assignmentStatus"
       FROM ai_assignments a
       WHERE a.id=(SELECT assignment_id FROM ai_operations WHERE id=$1)
       FOR UPDATE`,
      [id],
    )
  ).rows[0]
  if (!assignment) return null
  const operation = (
    await db().query<{ priceList: PriceList | null; origin: OperationOrigin }>(
      `SELECT price_list AS "priceList",origin FROM ai_operations
       WHERE id=$1 AND state='running' FOR UPDATE`,
      [id],
    )
  ).rows[0]
  return operation ? { ...assignment, ...operation } : null
}

/** What the end of an operation saves (T3-R06). */
export type OperationEnd = {
  state: EndedOperationState
  cause: OperationCause | null
  retryable: boolean | null
  usage: ExecutorUsage
  result: unknown
  actualCost: string | null
  finishedAt: Date
}

/** Saves the end of a running operation; false when it no longer runs. */
export async function saveEnd(id: string, end: OperationEnd): Promise<boolean> {
  const saved = await db().query(
    `UPDATE ai_operations SET state=$2,cause=$3,retryable=$4,usage=$5,
      result=$6,actual_cost=$7,finished_at=$8
     WHERE id=$1 AND state='running'`,
    [
      id,
      end.state,
      end.cause,
      end.retryable,
      JSON.stringify(end.usage),
      end.result === undefined ? null : JSON.stringify(end.result),
      end.actualCost,
      end.finishedAt,
    ],
  )
  return saved.rowCount === 1
}

/** An operation waiting for the budget, with its assignment's executor. */
export type OperationWaitingForBudget = {
  id: string
  executor: string
  type: AssignmentType
  executorParameters: ExecutorParameters
}

/**
 * The operations waiting for the budget whose assignment is in progress,
 * oldest first by the moment they became pending.
 */
export async function operationsWaitingForBudget(): Promise<
  OperationWaitingForBudget[]
> {
  return (
    await db().query<OperationWaitingForBudget>(
      `SELECT o.id,a.executor,a.type,
        a.executor_parameters AS "executorParameters"
       FROM ai_operations o JOIN ai_assignments a ON a.id=o.assignment_id
       WHERE o.state='pending' AND o.waits_for='budget'
        AND a.status='in_progress'
       ORDER BY o.pending_since,o.id`,
    )
  ).rows
}

/**
 * The budget charge of the operations of a group (ZA-R04), as SQL over
 * `ai_operations` columns: per started operation, the actual cost when
 * known and the potential cost otherwise; an operation that never started
 * charges nothing. The cost figures and the panel's list share it.
 */
export const operationsCharge = `coalesce(sum(coalesce(actual_cost,potential_cost))
          FILTER (WHERE budget_month IS NOT NULL),0)::numeric(16,6)::text`

/**
 * Whether an operation's actual cost is unknown, as an SQL condition over
 * `ai_operations` columns: it started, ended and has no actual cost.
 */
export const unknownActualCost = `started_at IS NOT NULL AND actual_cost IS NULL
          AND state IN ('succeeded','failed','uncertain')`

/** The cost figures of an assignment (T3-R08), amounts in złoty. */
export type AssignmentCostRow = {
  potential: string
  actual: string
  charge: string
  unknown: number
}

/**
 * The cost figures of a group of operations as an SQL select list over
 * `ai_operations` columns: `potential`, `actual`, `charge` and
 * `unknown`, as described at readAssignmentCostRow. The cost read and the
 * panel's details share it.
 */
export const operationsCostColumns = `coalesce(sum(potential_cost),0)::numeric(16,6)::text AS potential,
        coalesce(sum(actual_cost),0)::numeric(16,6)::text AS actual,
        ${operationsCharge} AS charge,
        (count(*) FILTER (WHERE ${unknownActualCost}))::int AS unknown`

/**
 * The cost figures of an assignment from its operations: the sum of the
 * potential costs, of the known actual costs, the budget charge (ZA-R04)
 * and the number of ended operations that started and have no actual cost.
 */
export async function readAssignmentCostRow(
  assignmentId: string,
): Promise<AssignmentCostRow> {
  return (
    await db().query<AssignmentCostRow>(
      `SELECT ${operationsCostColumns}
       FROM ai_operations WHERE assignment_id=$1`,
      [assignmentId],
    )
  ).rows[0]!
}
