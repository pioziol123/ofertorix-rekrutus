import { transaction } from '../../../lib/db.ts'
import { findExecutor } from '../infrastructure/adapters/registry.ts'
import {
  lockResultToDeliver,
  setFailedInProgress,
  setSucceeded,
  type ResultToDeliver,
} from '../infrastructure/persistence/assignments.ts'
import type { AgentMaterial } from '../domain/agent-material.ts'
import { assignmentReceiver } from './assignment-receiver.ts'

/**
 * The receiver did not take a result: it raised an error, or none is
 * registered. Carries the transaction's rollback to the delivery.
 */
class ResultNotTaken extends Error {
  constructor(assignmentId: string, cause?: unknown) {
    super(`The result of assignment ${assignmentId} was not taken`, { cause })
    this.name = 'ResultNotTaken'
  }
}

/**
 * Delivers the result of a succeeded operation to the receiver of its
 * assignment (solution design of epic sq2, T6, "Delivery after an
 * operation"), in the same process, right after the operation ended with
 * it, or when a later attempt of its job finds it succeeded with the
 * assignment still in progress (T6-R03, T6-R10). No job is sent for it
 * (ZA-D09).
 *
 * The delivery transaction locks the assignment's row and, while it is in
 * progress, calls the receiver's result entry with the result and, for an
 * agent, the materials its executor reads from the operation's executor
 * state, then sets the assignment succeeded: the receiver's saves and the
 * status are committed together (T6-R02). When the receiver raises an error
 * or none is registered, that transaction rolls back and a second one,
 * conditional on the assignment still being in progress, fails it with the
 * reason "result not taken" and calls the receiver's failure entry, when
 * there is a receiver (T6-R04). The operation's cost was settled when it
 * ended and stays so.
 *
 * Any other error, of the database, the commit or the second transaction,
 * a receiver's error on the failure included, is raised: the attempt fails
 * and the queue's next attempt repeats the delivery from its beginning
 * (T6-R05). An unknown operation, one not succeeded, or an assignment no
 * longer in progress: no effect, so a repeated call changes nothing.
 */
export async function deliverResult(
  operationId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    await transaction(async () => {
      const delivery = await lockResultToDeliver(operationId)
      if (!delivery) return
      const receiver = assignmentReceiver(delivery.settingsName)
      if (!receiver) throw new ResultNotTaken(delivery.assignmentId)
      const materials =
        delivery.type === 'agent' ? { materials: materialsOf(delivery) } : {}
      try {
        await receiver.receiveResult({
          assignmentId: delivery.assignmentId,
          result: delivery.result,
          ...materials,
        })
      } catch (error) {
        throw new ResultNotTaken(delivery.assignmentId, error)
      }
      await setSucceeded(delivery.assignmentId, now)
    })
  } catch (error) {
    if (!(error instanceof ResultNotTaken)) throw error
    await failNotTaken(operationId, now)
  }
}

/** Fails the assignment as "result not taken" and tells its receiver. */
async function failNotTaken(operationId: string, now: Date): Promise<void> {
  await transaction(async () => {
    const delivery = await lockResultToDeliver(operationId)
    if (!delivery) return
    await setFailedInProgress(delivery.assignmentId, 'delivery_failed', now)
    await assignmentReceiver(delivery.settingsName)?.receiveFailure({
      assignmentId: delivery.assignmentId,
    })
  })
}

/**
 * The materials of an agent session, read by its executor from the state
 * it saved. Without the executor in this process the delivery cannot be
 * made: the attempt fails.
 */
function materialsOf(delivery: ResultToDeliver): AgentMaterial[] {
  const executor = findExecutor(delivery.executor)
  if (!executor)
    throw new Error(
      `No executor ${delivery.executor} to read the materials of assignment ${delivery.assignmentId}`,
    )
  return executor.materials(delivery.executorState) ?? []
}
