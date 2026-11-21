import { transaction } from '../../../lib/db.ts'
import { nothingSent, type ExecutorOutcome } from '../executors/outcome.ts'
import { findExecutor } from '../executors/registry.ts'
import {
  appendExchange,
  readRunningOperation,
  saveExecutorState,
} from '../infrastructure/persistence/operations.ts'

/**
 * Carries out a running operation through its executor, once, outside any
 * transaction (step 2 of the operation's handler, solution design of epic
 * sq2, T3): the executor gets the frozen content of the assignment, the
 * executor parameters, the executor state saved so far and two writers,
 * each conditional on the operation still running, so a late process
 * writes nothing (T2-R08, T5-R04). It returns the executor's outcome, or
 * null when the operation does not run. An executor that no longer exists
 * under the frozen name could take nothing: a non-retryable failure with
 * nothing sent. The outcome is saved by the end of the operation (T3).
 */
export async function carryOutOperation(
  operationId: string,
): Promise<ExecutorOutcome | null> {
  const operation = await readRunningOperation(operationId)
  if (!operation) return null
  const executor = findExecutor(operation.executor)
  if (!executor)
    return {
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
      usage: nothingSent(),
    }
  return executor.carryOut({
    content: {
      type: operation.type,
      instruction: operation.instruction,
      input: operation.input,
      responseFormat: operation.responseFormat,
      agent: operation.agentOptions,
    },
    parameters: operation.executorParameters,
    state: operation.executorState,
    exchange: (kind, raw) =>
      transaction(() => appendExchange(operationId, kind, raw)),
    saveState: (state) =>
      transaction(() => saveExecutorState(operationId, state)),
  })
}
