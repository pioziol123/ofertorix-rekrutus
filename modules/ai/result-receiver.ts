import type { ExecutionEnd } from './domain/execution-state.ts'

/** The cost of an execution's attempt at the moment of delivery. */
export type ExecutionCost = {
  reserved: string
  /** The settled cost, or null when it is unknown and stays reserved. */
  actual: string | null
}

export type ExecutionResultDelivery = {
  executionId: string
  operationId: string
  inputVersion: string | null
  result: unknown
  cost: ExecutionCost
}

/**
 * A final state without a result: `failed` when AI knows how the work
 * ended, `uncertain` when it cannot tell, with the cause from the
 * exported list.
 */
export type ExecutionFailureDelivery = ExecutionEnd & {
  executionId: string
  operationId: string
  inputVersion: string | null
  cost: ExecutionCost
}

/**
 * The client's decision on a result. A rejected result ends the execution
 * as `rejected`; the client keeps its own reason in its own data.
 */
export type ReceiverDecision = { accepted: true } | { accepted: false }

/**
 * The client's receiver of the results of a settings key. AI calls it in
 * the transaction that saves the settlement, so the client's publication
 * and the settlement commit together. The cost is settled whatever it
 * decides. An exception is not a decision: the transaction rolls back, the
 * execution keeps its saved outcome and waits for delivery, and AI calls
 * the receiver again. A receiver must therefore accept the same delivery
 * more than once; a failed delivery leaves none of its writes.
 */
export type ResultReceiver = {
  /**
   * A result that matches the response schema. The provider enforces the
   * schema (strict structured output); AI checks that the result is JSON.
   */
  receiveResult(delivery: ExecutionResultDelivery): Promise<ReceiverDecision>
  /** A final state without a result. */
  receiveFailure(delivery: ExecutionFailureDelivery): Promise<void>
}

const receivers = new Map<string, ResultReceiver>()

/** Registers the receiver of a settings key where dependencies are composed. */
export function registerResultReceiver(
  settingsKey: string,
  receiver: ResultReceiver,
): void {
  receivers.set(settingsKey, receiver)
}

export function resultReceiver(
  settingsKey: string,
): ResultReceiver | undefined {
  return receivers.get(settingsKey)
}
