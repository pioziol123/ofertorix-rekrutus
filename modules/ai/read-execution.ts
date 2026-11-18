import type {
  ExecutionCause,
  ExecutionState,
} from './domain/execution-state.ts'
import {
  readExecutionRow,
  readLatestExecutionRow,
  readOperationExecutionRows,
  type ExecutionRow,
} from './infrastructure/persistence/executions.ts'
import type { ExecutionMode } from './execution-settings.ts'
import type { ModelUsage } from './provider-adapter.ts'

/**
 * The public read of an execution. Its state and cause are values of the
 * exported lists, the same for every provider; it tells nothing about how
 * the execution reached them.
 */
export type AiExecution = {
  id: string
  /** The client's settings key the execution was requested under. */
  settingsKey: string
  operationId: string
  inputVersion: string | null
  mode: ExecutionMode
  groupId: string | null
  /** The attempt number within the operation; a retry is a new execution. */
  attempt: number
  state: ExecutionState
  result: unknown
  usage: ModelUsage | null
  cost: {
    reserved: string
    /** The settled cost; null while it is not settled. */
    actual: string | null
  }
  /** Why the execution ended without a result; null otherwise. */
  cause: ExecutionCause | null
  /** The client's reason for rejecting the result; null otherwise. */
  rejectionReason: string | null
  /**
   * Deliveries of the outcome to the client's receiver so far, and the
   * error of the last one that did not reach a decision.
   */
  delivery: { attempts: number; lastError: string | null }
  createdAt: Date
  finishedAt: Date | null
}

function toPublic(row: ExecutionRow): AiExecution {
  const settled = row.attempt.state === 'settled'
  return {
    id: row.id,
    settingsKey: row.settingsKey,
    operationId: row.operationId,
    inputVersion: row.inputVersion,
    mode: row.mode,
    groupId: row.groupId,
    attempt: row.attempt.number,
    state: row.state,
    result: row.result,
    usage: row.attempt.usage,
    cost: {
      reserved: row.attempt.reserved,
      actual: settled ? row.attempt.actual : null,
    },
    cause: row.cause,
    rejectionReason: row.rejectionReason,
    delivery: {
      attempts: row.delivery.attempts,
      lastError: row.delivery.error,
    },
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  }
}

/** The state, result, usage and cost of an execution. */
export async function readExecution(
  executionId: string,
): Promise<AiExecution | null> {
  const row = await readExecutionRow(executionId)
  return row ? toPublic(row) : null
}

/** Every execution of an operation, oldest first: its attempt history. */
export async function readExecutionHistory(
  operationId: string,
): Promise<AiExecution[]> {
  return (await readOperationExecutionRows(operationId)).map(toPublic)
}

/**
 * The latest execution of an operation, for a client that shows the state
 * of its own operation; null when the operation has none.
 */
export async function readLatestExecution(
  operationId: string,
): Promise<AiExecution | null> {
  const row = await readLatestExecutionRow(operationId)
  return row ? toPublic(row) : null
}
