import { setTimeout as delay } from 'node:timers/promises'
import { transaction } from '../../lib/db.ts'
import { admitExecutions } from './admit-executions.ts'
import { chargeCeiling } from './domain/cost.ts'
import { savedSettingsEndpoint } from './execution-settings.ts'
import {
  claimExecution,
  finishExecution,
  settleAttempt,
  type ExecutionRow,
  type Settlement,
} from './infrastructure/persistence/executions.ts'
import {
  emptyUsage,
  ModelError,
  providerAdapter,
  type ModelUsage,
} from './provider-adapter.ts'
import { resultReceiver, type ExecutionCost } from './result-receiver.ts'

/** The attempts an operation gets for transient errors, as before. */
const maxAttempts = 2

type Outcome = {
  /** The parsed result, or undefined when the execution ended without one. */
  result?: unknown
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
    cause: null,
    usage: emptyUsage(),
    responseId: null,
    notSent: false,
    retry: false,
    retryAfterMs: 1000,
  }
  const single =
    execution.mode === 'single'
      ? providerAdapter(settings.provider)?.single
      : undefined
  if (!single) return { ...outcome, cause: 'unsupported_mode', notSent: true }
  if (!savedSettingsEndpoint(settings))
    return { ...outcome, cause: 'configuration', notSent: true }
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
    try {
      return { ...outcome, result: JSON.parse(response.text) }
    } catch {
      return { ...outcome, cause: 'format' }
    }
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
    error: outcome.cause,
  }
}

/** Ends the attempt and requests the next one of the same operation. */
async function retry(execution: ExecutionRow, settlement: Settlement) {
  await transaction(async () => {
    await settleAttempt(execution.id, settlement)
    await finishExecution(execution.id, {
      state: 'retried',
      result: null,
      cause: settlement.error,
    })
    await admitExecutions(
      [
        {
          jobType: execution.jobType,
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

/**
 * Saves the settlement and hands the outcome to the client's receiver in
 * the same transaction.
 */
async function deliver(
  execution: ExecutionRow,
  outcome: Outcome,
  settlement: Settlement,
) {
  const receiver = resultReceiver(execution.jobType)
  const cost: ExecutionCost = {
    reserved: execution.attempt.reserved,
    actual: settlement.actual,
  }
  const delivery = {
    executionId: execution.id,
    operationId: execution.operationId,
    inputVersion: execution.inputVersion,
    cost,
  }
  const result = outcome.result === undefined ? null : outcome.result
  await transaction(async () => {
    await settleAttempt(execution.id, settlement)
    if (!receiver) throw new MissingReceiver()
    if (outcome.result === undefined) {
      const cause = outcome.cause ?? 'unknown'
      await receiver.receiveFailure({ ...delivery, cause })
      await finishExecution(execution.id, { state: 'failed', result, cause })
      return
    }
    const decision = await receiver.receiveResult({ ...delivery, result })
    await finishExecution(
      execution.id,
      decision.accepted
        ? { state: 'completed', result, cause: null }
        : { state: 'rejected', result, cause: decision.reason },
    )
  }).catch(async (error: unknown) => {
    // The client's writes are rolled back; the cost is still settled.
    await transaction(async () => {
      await settleAttempt(execution.id, settlement)
      await finishExecution(execution.id, {
        state: 'failed',
        result,
        cause:
          error instanceof MissingReceiver ? 'no_receiver' : 'receiver_error',
      })
    })
  })
}

class MissingReceiver extends Error {}

/**
 * Handles one job of the AI execution queue: claims the execution, calls
 * the provider, settles the attempt and delivers the outcome, or retries
 * a transient error once as a new attempt of the same operation.
 */
export async function runExecution(executionId: string): Promise<void> {
  const execution = await transaction(() => claimExecution(executionId))
  if (!execution) return
  const outcome = await callProvider(execution)
  const settlement = settlementOf(execution, outcome)
  if (outcome.retry && execution.attempt.number < maxAttempts) {
    await delay(outcome.retryAfterMs)
    await retry(execution, settlement)
    return
  }
  await deliver(execution, outcome, settlement)
}
