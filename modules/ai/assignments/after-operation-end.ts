import { randomUUID } from 'node:crypto'
import { sendJob } from '../../../lib/queues/index.ts'
import { findExecutor } from '../executors/registry.ts'
import {
  insertPendingOperation,
  readAssignmentOperations,
  setNeedsAttention,
} from '../infrastructure/persistence/assignments.ts'
import type { OperationOrigin } from '../infrastructure/persistence/operations.ts'
import type { AssignmentStatus } from './assignment.ts'

/** An operation that has just ended, with its assignment's status. */
export type EndedOperation = {
  operationId: string
  assignmentId: string
  /** The assignment's status, read with its row locked. */
  assignmentStatus: AssignmentStatus
  state: 'succeeded' | 'failed' | 'uncertain'
  /** Whether a failed operation may be retried; null unless failed. */
  retryable: boolean | null
  origin: OperationOrigin
}

/** What follows the end of an operation for its assignment. */
export type NextStep =
  /** Nothing in this transaction. */
  | 'nothing'
  /** A further automatic operation, pending and waiting for the executor. */
  | 'next_operation'
  /** The assignment needs attention. */
  | 'needs_attention'

/**
 * The rule of what follows the end of an operation (solution design of
 * epic sq2, "Contract: what follows the end of an operation"), from the
 * ended operation and the number of the assignment's automatic operations,
 * the ended one included, against its limit:
 * - an assignment that is not in progress is left as it is, also one that
 *   failed while its operation ran; a result stays with its operation;
 * - a result of an assignment in progress: nothing here, its delivery comes
 *   with task oferty-pracy-sq2.7;
 * - an ordinary failure of an automatic operation while the assignment has
 *   fewer automatic operations than its limit: a next operation, with no
 *   delay (T4-R01, T4-R02);
 * - any other failure, the last automatic one, a non-retryable one or one
 *   of an operation the owner added, and an uncertain end: needs attention
 *   (T4-R03).
 * The deadline is not read here until task oferty-pracy-sq2.7 adds the
 * time limit; past it, the same rows apply and the time limit fails the
 * assignment at its next pass.
 */
export function nextStep(
  ended: Pick<
    EndedOperation,
    'assignmentStatus' | 'state' | 'retryable' | 'origin'
  >,
  operations: { automaticOperations: number; automaticOperationLimit: number },
): NextStep {
  if (ended.assignmentStatus !== 'in_progress') return 'nothing'
  if (ended.state === 'succeeded') return 'nothing'
  if (
    ended.state === 'failed' &&
    ended.retryable === true &&
    ended.origin === 'automatic' &&
    operations.automaticOperations < operations.automaticOperationLimit
  )
    return 'next_operation'
  return 'needs_attention'
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
  if (ended.assignmentStatus !== 'in_progress' || ended.state === 'succeeded')
    return
  const operations = await readAssignmentOperations(ended.assignmentId)
  switch (nextStep(ended, operations)) {
    case 'next_operation':
      return addNextOperation(ended.assignmentId, operations)
    case 'needs_attention':
      await setNeedsAttention(ended.assignmentId)
      return
    case 'nothing':
      return
  }
}

async function addNextOperation(
  assignmentId: string,
  operations: { executor: string; lastOrdinal: number },
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
    origin: 'automatic',
  })
  await sendJob(executor.job, { operationId })
}
