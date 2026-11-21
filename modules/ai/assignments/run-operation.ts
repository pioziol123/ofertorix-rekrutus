import type { OperationJobData } from '../executors/declaration.ts'
import { carryOutOperation } from './carry-out-operation.ts'
import { endOperation } from './end-operation.ts'
import { startOperation } from './start-operation.ts'

/**
 * The job handler of every executor's queue (solution design of epic sq2,
 * T3, "Handler of an operation's job"): starts the operation within the
 * budget, carries it out through its executor once, outside any
 * transaction, and ends it with the outcome in one save (T3-R06). An
 * operation that does not start, because it waits for the budget, ended
 * without starting or is not pending, ends the job without calling the
 * executor. The queue's exclusivity on a constant key gives one operation
 * at a time per executor, in the order their jobs were sent (T3-R01,
 * ZA-D01). `clock` gives the moments of the start and the end.
 */
export async function runOperation(
  { operationId }: OperationJobData,
  clock: () => Date = () => new Date(),
): Promise<void> {
  if ((await startOperation(operationId, clock())) !== 'started') return
  const outcome = await carryOutOperation(operationId)
  if (!outcome) return
  await endOperation(operationId, outcome, clock())
}
