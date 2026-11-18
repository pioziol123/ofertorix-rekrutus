import type {
  ExecutionCause,
  ExecutionState,
} from './domain/execution-state.ts'
import { readArchiveArtifacts } from './infrastructure/persistence/batch-archive.ts'
import {
  countActiveExecutionRows,
  readExecutionRow,
  readLatestExecutionRows,
  readLatestExecutionRow,
  readOperationExecutionRows,
  type ExecutionRow,
  type ExecutionSnapshot,
} from './infrastructure/persistence/executions.ts'
import { adapterOfExecution } from './provider-registry.ts'
import type { ExecutionMode } from './execution-settings.ts'
import type { ModelUsage, SavedBatchBody } from './provider-adapter.ts'

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

// ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the reads below serve Matching's
// views and its group command.
/**
 * The latest execution of each given operation that has one, in one read,
 * for a client that shows the state of many of its operations at once.
 */
export async function readLatestExecutions(
  operationIds: readonly string[],
): Promise<AiExecution[]> {
  if (!operationIds.length) return []
  return (await readLatestExecutionRows([...operationIds])).map(toPublic)
}

/** How many executions requested under a settings key are in progress. */
export async function countActiveExecutions(
  settingsKey: string,
): Promise<number> {
  return countActiveExecutionRows(settingsKey)
}

/**
 * The diagnostic archive of an execution: for one sent in a provider batch,
 * the exact files and replies of the batch, kept under its group; for a
 * single-mode execution whose client asked for it, the exact request body
 * and raw response, kept under the execution. Empty when nothing was kept;
 * null for an unknown execution.
 * When a batch kept no input, `savedBodies` may give the request bodies
 * its client saved before the archive kept inputs; the provider's adapter
 * then rebuilds the input file from them as `reconstructedInput`, which
 * is never the original upload. ASSUMPTION(oferty-pracy-0mq.21/ASM-8)
 */
export async function readExecutionArchive(
  executionId: string,
  savedBodies?: (archiveId: string) => Promise<SavedBatchBody[]>,
): Promise<{
  archiveId: string
  artifacts: {
    kind: 'input' | 'output' | 'error' | 'metadata'
    artifact_key: string
    sha256: string
    content: string
    created_at: Date
  }[]
  reconstructedInput: string | null
} | null> {
  const row = await readExecutionRow(executionId)
  if (!row) return null
  const archiveId = row.mode === 'batch' && row.groupId ? row.groupId : row.id
  const artifacts = await readArchiveArtifacts(archiveId)
  let reconstructedInput: string | null = null
  if (savedBodies && !artifacts.some((a) => a.kind === 'input')) {
    const bodies = await savedBodies(archiveId)
    const reconstruct = adapterOfExecution(
      (row.snapshot as Partial<ExecutionSnapshot>).settings?.provider,
    )?.reconstructBatchInput
    if (bodies.length && reconstruct) reconstructedInput = reconstruct(bodies)
  }
  return { archiveId, artifacts, reconstructedInput }
}
