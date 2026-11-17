import { setTimeout as delay } from 'node:timers/promises'
import { transaction } from '../../lib/db.ts'
import { admitExecutions } from './admit-executions.ts'
import { chargeCeiling } from './domain/cost.ts'
import { parseResult } from './domain/response-schema.ts'
import {
  claimDelivery,
  claimExecution,
  finishExecution,
  recordFailedDelivery,
  saveOutcome,
  settleAttempt,
  settleSavedAttempt,
  type ExecutionRow,
  type Settlement,
} from './infrastructure/persistence/executions.ts'
import { emptyUsage, ModelError, type ModelUsage } from './provider-adapter.ts'
import { providerAdapter } from './provider-registry.ts'
import { resultReceiver } from './result-receiver.ts'

/** The attempts an operation gets for transient errors, as before. */
const maxAttempts = 2

type Outcome = {
  /** The parsed result, or null when the execution ended without one. */
  result: unknown
  cause: string | null
  usage: ModelUsage
  responseId: string | null
  /** Nothing reached the provider, so nothing was spent. */
  notSent: boolean
  retry: boolean
  retryAfterMs: number
}

/** Calls the provider through its adapter and classifies what happened. */
async function callProvider(execution: ExecutionRow): Promise<Outcome> {
  const { settings, instruction, input, responseSchema } = execution.snapshot
  const outcome: Outcome = {
    result: null,
    cause: null,
    usage: emptyUsage(),
    responseId: null,
    notSent: false,
    retry: false,
    retryAfterMs: 1000,
  }
  // A request is accepted only in a mode the adapter declares (refused
  // otherwise with unsupported_mode, before any reservation). An adapter
  // that no longer declares it when the job runs is a failure on the AI
  // side with its own cause; nothing reached a provider.
  const single =
    execution.mode === 'single'
      ? providerAdapter(settings.provider)?.modes.single
      : undefined
  if (!single)
    return { ...outcome, cause: 'adapter_unavailable', notSent: true }
  try {
    const response = await single(settings).generate({
      model: settings.model,
      instructions: instruction,
      input,
      output: responseSchema,
    })
    outcome.usage = response.usage
    outcome.responseId = response.responseId
    if (response.outcome !== 'completed' || response.text === null)
      return { ...outcome, cause: response.outcome }
    // Only a result that matches the response schema reaches the receiver.
    const result = parseResult(response.text, responseSchema.schema)
    return result === undefined
      ? { ...outcome, cause: 'format' }
      : { ...outcome, result }
  } catch (error) {
    if (!(error instanceof ModelError)) return { ...outcome, cause: 'unknown' }
    return {
      ...outcome,
      cause: error.code,
      usage: error.details.usage ?? outcome.usage,
      responseId: error.details.responseId ?? outcome.responseId,
      retry: error.details.transient === true,
      retryAfterMs: error.details.retryAfterMs ?? 1000,
    }
  }
}

/**
 * The confirmed cost from the usage and the saved price list. Usage that is
 * missing or beyond the recorded caps leaves the cost unknown and reserved.
 */
function settlementOf(execution: ExecutionRow, outcome: Outcome): Settlement {
  const pricing = execution.snapshot.settings.pricing
  const { inputTokens, outputTokens } = outcome.usage
  const known =
    inputTokens !== null &&
    outputTokens !== null &&
    inputTokens <= pricing.maxInputTokens &&
    outputTokens <= pricing.maxOutputTokens
  return {
    actual: outcome.notSent
      ? '0.000000'
      : known
        ? chargeCeiling(pricing, inputTokens, outputTokens)
        : null,
    usage: outcome.usage,
    responseId: outcome.responseId,
  }
}

/** Ends the attempt and requests the next one of the same operation. */
async function retry(
  execution: ExecutionRow,
  settlement: Settlement,
  cause: string | null,
) {
  await transaction(async () => {
    await settleAttempt(execution.id, settlement)
    await finishExecution(execution.id, {
      state: 'retried',
      cause,
    })
    await admitExecutions(
      [
        {
          settingsKey: execution.settingsKey,
          operationId: execution.operationId,
          inputVersion: execution.inputVersion,
          mode: execution.mode,
          groupId: execution.groupId,
          supersedes: execution.id,
          snapshot: execution.snapshot,
          attempt: execution.attempt.number + 1,
          generation: execution.attempt.generation,
        },
      ],
      execution.snapshot.settings,
    )
  })
}

/** Why a delivery did not reach the client's decision, for diagnostics. */
function deliveryError(error: unknown) {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.slice(0, 500)
}

/**
 * Hands the saved outcome to the client's receiver and, in the same
 * transaction, settles the attempt and ends the execution with the
 * receiver's decision. When the receiver throws, everything of this
 * delivery is rolled back, the execution stays `delivering` with its cost
 * reserved, and the error is raised so that the queue retries the job.
 */
async function deliver(executionId: string) {
  try {
    await transaction(async () => {
      const execution = await claimDelivery(executionId)
      if (!execution) return
      const receiver = resultReceiver(execution.settingsKey)
      if (!receiver)
        throw new Error(`No receiver for settings key ${execution.settingsKey}`)
      const delivery = {
        executionId: execution.id,
        operationId: execution.operationId,
        inputVersion: execution.inputVersion,
        cost: {
          reserved: execution.attempt.reserved,
          actual: execution.attempt.actual,
        },
      }
      await settleSavedAttempt(execution.id)
      if (execution.result === null) {
        const cause = execution.cause ?? 'unknown'
        await receiver.receiveFailure({ ...delivery, cause })
        await finishExecution(execution.id, { state: 'failed', cause })
        return
      }
      const decision = await receiver.receiveResult({
        ...delivery,
        result: execution.result,
      })
      await finishExecution(
        execution.id,
        decision.accepted
          ? { state: 'completed', cause: null }
          : { state: 'rejected', cause: decision.reason },
      )
    })
  } catch (error) {
    await recordFailedDelivery(executionId, deliveryError(error))
    throw error
  }
}

/**
 * Handles one job of the AI execution queue. A queued execution is
 * claimed, the provider called once, and the outcome saved before it is
 * delivered; a transient error is retried once as a new attempt of the same
 * operation. An execution waiting for delivery is delivered again without
 * calling the provider.
 */
export async function runExecution(executionId: string): Promise<void> {
  const execution = await transaction(() => claimExecution(executionId))
  if (execution) {
    const outcome = await callProvider(execution)
    const settlement = settlementOf(execution, outcome)
    if (outcome.retry && execution.attempt.number < maxAttempts) {
      await delay(outcome.retryAfterMs)
      await retry(execution, settlement, outcome.cause)
      return
    }
    await transaction(() =>
      saveOutcome(
        execution.id,
        { result: outcome.result, cause: outcome.cause },
        settlement,
      ),
    )
  }
  await deliver(executionId)
}
