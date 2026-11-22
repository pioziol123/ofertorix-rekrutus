import type { OperationJobData } from '../ports/executor.ts'
import { carryOutOperation } from './carry-out-operation.ts'
import { deliverResult } from './deliver-result.ts'
import { endOperation } from './end-operation.ts'
import { startOperation } from './start-operation.ts'

/**
 * The job handler of every executor's queue (solution design of epic sq2,
 * T3, "Handler of an operation's job"): starts the operation within the
 * budget, carries it out through its executor once, outside any
 * transaction, and ends it with the outcome in one save (T3-R06). A result
 * is then delivered to the assignment's receiver in the same process
 * (T6-R03); an operation found succeeded with its assignment in progress,
 * whose earlier attempt stopped before the delivery, is delivered without
 * calling the executor (T6-R10). An operation that does not start, because
 * it waits for the budget, ended without starting, was found running and
 * ended as uncertain (T5-R01) or is not pending, ends the job without
 * calling the executor. The queue's exclusivity on a constant key gives one
 * operation at a time per executor, in the order their jobs were sent
 * (T3-R01, ZA-D01). `clock` gives the moments of the start, the end and
 * the delivery.
 */
export async function runOperation(
  { operationId }: OperationJobData,
  clock: () => Date = () => new Date(),
): Promise<void> {
  const start = await startOperation(operationId, clock())
  if (start === 'delivers') return deliverResult(operationId, clock())
  if (start !== 'started') return
  const outcome = await carryOutOperation(operationId)
  if (!outcome) return
  const ended = await endOperation(operationId, outcome, clock())
  if (ended && outcome.kind === 'result')
    await deliverResult(operationId, clock())
}
