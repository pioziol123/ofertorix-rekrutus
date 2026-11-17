import {
  readExecutionRow,
  readOperationExecutionRows,
  type ExecutionRow,
  type ExecutionState,
} from './infrastructure/persistence/executions.ts'
import type { ExecutionMode } from './execution-settings.ts'
import type { ModelUsage } from './provider-adapter.ts'

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
    /** The settled cost; null until settled or while it is unknown. */
    actual: string | null
    /** The cost could not be confirmed and stays reserved. */
    unknown: boolean
  }
  /** Why the execution failed, or why the client rejected its result. */
  cause: string | null
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
      unknown: row.attempt.state === 'unknown',
    },
    cause: row.cause,
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
