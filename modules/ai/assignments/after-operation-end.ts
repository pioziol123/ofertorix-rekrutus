import { randomUUID } from 'node:crypto'
import { sendJob } from '../../../lib/queues/index.ts'
import { findExecutor } from '../infrastructure/adapters/registry.ts'
import {
  insertPendingOperation,
  readAssignmentOperations,
  setNeedsAttention,
} from '../infrastructure/persistence/assignments.ts'
import type { AssignmentStatus } from '../domain/assignment.ts'
import { nextStep } from '../domain/next-step.ts'
import type {
  EndedOperationState,
  OperationOrigin,
} from '../domain/operation.ts'

/** An operation that has just ended, with its assignment's status. */
export type EndedOperation = {
  operationId: string
  assignmentId: string
  /** The assignment's status, read with its row locked. */
  assignmentStatus: AssignmentStatus
  state: EndedOperationState
  /** Whether a failed operation may be retried; null unless failed. */
  retryable: boolean | null
  origin: OperationOrigin
  /** The moment of the end, compared with the assignment's deadline. */
  now: Date
}

/**
 * Decides and carries out what follows the end of an operation for its
 * assignment, by `nextStep`. It runs in the transaction that ended the
 * operation, after the assignment's row was locked, and every caller that
 * ends an operation uses it. A next operation is inserted pending, waiting
 * for the executor, with its job sent to the executor's queue in the same
 * transaction, so it joins the end of the executor's line; it carries out
 * the same frozen content of the assignment. Needs attention is a
 * conditional change of the status, so nothing of the assignment runs or
 * waits then: its only operation has ended. The executor is the one the
 * ended operation ran with; when the process no longer knows it, sending
 * the next job throws and the caller's transaction rolls back.
 */
export async function afterOperationEnd(ended: EndedOperation): Promise<void> {
  const operations = await readAssignmentOperations(ended.assignmentId)
  const deadlinePassed = operations.deadline <= ended.now
  switch (nextStep(ended, { ...operations, deadlinePassed })) {
    case 'next_operation':
      return addOperation(ended.assignmentId, operations, 'automatic')
    case 'needs_attention':
      await setNeedsAttention(ended.assignmentId)
      return
    case 'nothing':
      return
  }
}

/**
 * Adds an operation to an assignment after its last one: pending, waiting
 * for the executor, with its job sent to the end of the executor's queue in
 * the caller's transaction, so it carries out the same frozen content. An
 * automatic one follows an ordinary failure (T4-R02); a manual one is the
 * owner's Retry (T12-R01), and its failure never meets the retry rule of
 * `nextStep` (T12-R02). The caller holds the lock on the assignment's row.
 * When the process no longer knows the executor, it throws and the
 * caller's transaction rolls back.
 */
export async function addOperation(
  assignmentId: string,
  operations: { executor: string; lastOrdinal: number },
  origin: OperationOrigin,
): Promise<void> {
  const executor = findExecutor(operations.executor)
  if (!executor)
    throw new Error(
      `No executor ${operations.executor} for the next operation of assignment ${assignmentId}`,
    )
  const operationId = randomUUID()
  await insertPendingOperation({
    id: operationId,
    assignmentId,
    ordinal: operations.lastOrdinal + 1,
    origin,
  })
  await sendJob(executor.job, { operationId })
}
