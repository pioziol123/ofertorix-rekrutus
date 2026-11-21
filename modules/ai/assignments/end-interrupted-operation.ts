import {
  endRunningAsUncertain,
  type OperationToStart,
} from '../infrastructure/persistence/operations.ts'
import { afterOperationEnd } from './after-operation-end.ts'

/**
 * Ends an operation found running by a later attempt of its background
 * work or by the failure handler (solution design of epic sq2, T5;
 * ZA-D04): the attempt that left it running has ended or was lost, which
 * the queue's exclusivity guarantees, so its work stopped without an
 * outcome. It ends as uncertain with the cause `unknown`, an unknown actual
 * cost and its potential cost kept charged (T5-R01, T5-R02), and what
 * follows the end moves its assignment in progress to needs attention
 * (T4-R03). The executor is not called again, also when nothing had been
 * sent to the provider: no operation is repeated by itself (T5-R05). Why
 * the work stopped is not worked out. It runs in the caller's transaction,
 * with the assignment's row and the operation's locked; the end is
 * conditional on the operation still running, so a late process that
 * returns afterwards saves nothing (T5-R04).
 */
export async function endInterruptedOperation(
  operation: Pick<
    OperationToStart,
    'id' | 'assignmentId' | 'assignmentStatus' | 'origin'
  >,
  now: Date,
): Promise<void> {
  if (!(await endRunningAsUncertain(operation.id, now))) return
  await afterOperationEnd({
    operationId: operation.id,
    assignmentId: operation.assignmentId,
    assignmentStatus: operation.assignmentStatus,
    state: 'uncertain',
    retryable: null,
    origin: operation.origin,
    now,
  })
}
