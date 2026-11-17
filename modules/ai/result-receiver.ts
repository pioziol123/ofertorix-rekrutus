import type { AiJobType } from './execution-settings.ts'

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

export type ExecutionFailureDelivery = {
  executionId: string
  operationId: string
  inputVersion: string | null
  cause: string
  cost: ExecutionCost
}

export type ReceiverDecision =
  { accepted: true } | { accepted: false; reason: string }

/**
 * The client's receiver of a job type's results. AI calls it in the
 * transaction that saves the settlement, so the client's publication and
 * the settlement commit together. The cost is settled whatever it decides.
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

const receivers = new Map<AiJobType, ResultReceiver>()

/** Registers the receiver of a job type where dependencies are composed. */
export function registerResultReceiver(
  jobType: AiJobType,
  receiver: ResultReceiver,
): void {
  receivers.set(jobType, receiver)
}

export function resultReceiver(jobType: AiJobType): ResultReceiver | undefined {
  return receivers.get(jobType)
}
