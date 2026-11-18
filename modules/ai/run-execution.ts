import { setTimeout as delay } from 'node:timers/promises'
import { transaction } from '../../lib/db.ts'
import { admitExecutions } from './admit-executions.ts'
import { chargeCeiling } from './domain/cost.ts'
import type { ExecutionEnd } from './domain/execution-state.ts'
import { parseResult } from './domain/response-schema.ts'
import { resendExecutionJob } from './execution-queue.ts'
import {
  claimDelivery,
  claimExecution,
  finishExecution,
  readExecutionRow,
  recordFailedDelivery,
  saveOutcome,
  settleAttempt,
  settleSavedAttempt,
  type ExecutionRow,
  type Settlement,
} from './infrastructure/persistence/executions.ts'
import {
  archiveLocal,
  authorizeLocalRequest,
  claimLocalSlot,
  finishLocal,
  queuedLocalExecutions,
  renewLocal,
  type LocalClaim,
} from './infrastructure/persistence/local-slot.ts'
import {
  emptyUsage,
  ModelError,
  type ModelUsage,
  type ProviderAdapter,
} from './provider-adapter.ts'
import { providerAdapter } from './provider-registry.ts'
import { resultReceiver } from './result-receiver.ts'

/** The attempts an operation gets for transient errors, as before. */
const maxAttempts = 2
/** How often a worker on the shared local slot extends its lease. */
const leaseRenewalMs = 15_000

export type Outcome = {
  /** The parsed result, or null when the execution ended without one. */
  result: unknown
  /** The end the adapter decided for an outcome without a result. */
  end: ExecutionEnd | null
  usage: ModelUsage
  responseId: string | null
  /** Nothing reached the provider, so nothing was spent. */
  notSent: boolean
  retry: boolean
  retryAfterMs: number
}

export const noOutcome = (): Outcome => ({
  result: null,
  end: null,
  usage: emptyUsage(),
  responseId: null,
  notSent: false,
  retry: false,
  retryAfterMs: 1000,
})

/**
 * Takes a queued execution for work. An execution of a provider on the
 * shared local slot is taken only together with the slot, in request
 * order; otherwise it stays queued until the slot is free.
 */
async function claim(executionId: string) {
  return transaction(async () => {
    const queued = await readExecutionRow(executionId)
    if (queued?.state !== 'queued') return null
    let local: LocalClaim | null = null
    if (providerAdapter(queued.snapshot.settings.provider)?.sharedSlot) {
      local = await claimLocalSlot(executionId)
      if (!local) return null
    }
    const execution = await claimExecution(executionId)
    return execution ? { execution, local } : null
  })
}

/** Calls the provider through its adapter and classifies what happened. */
async function callProvider(
  execution: ExecutionRow,
  adapter: ProviderAdapter | undefined,
  local: LocalClaim | null,
): Promise<Outcome> {
  const { settings, instruction, input, responseSchema } = execution.snapshot
  const outcome = noOutcome()
  // A request is accepted only in a mode the adapter declares (refused
  // otherwise with unsupported_mode, before any reservation). An adapter
  // that no longer declares it when the job runs is a failure on the AI
  // side with its own cause; nothing reached a provider.
  const single = execution.mode === 'single' ? adapter?.modes.single : undefined
  if (!adapter || !single)
    return {
      ...outcome,
      end: { state: 'failed', cause: 'adapter_unavailable' },
      notSent: true,
    }
  try {
    const response = await single(settings, {
      fixed: execution.snapshot.fixed ?? {},
      ...(local
        ? {
            beforeSend: () => authorizeLocalRequest(local),
            archive: (raw: string) => archiveLocal(local, raw),
          }
        : {}),
    }).generate({
      model: settings.model,
      instructions: instruction,
      input,
      output: responseSchema,
    })
    outcome.usage = response.usage
    outcome.responseId = response.responseId
    if (response.outcome !== 'completed')
      return {
        ...outcome,
        end: adapter.endOf({ kind: 'outcome', outcome: response.outcome }),
      }
    // Only a result that matches the response schema reaches the receiver.
    const result =
      response.text === null
        ? undefined
        : parseResult(response.text, responseSchema.schema)
    return result === undefined
      ? { ...outcome, end: { state: 'failed', cause: 'format' } }
      : { ...outcome, result }
  } catch (error) {
    const end = adapter.endOf({ kind: 'error', error })
    if (!(error instanceof ModelError)) return { ...outcome, end }
    return {
      ...outcome,
      end,
      usage: error.details.usage ?? outcome.usage,
      responseId: error.details.responseId ?? outcome.responseId,
      retry: error.details.transient === true,
      retryAfterMs: error.details.retryAfterMs ?? 1000,
    }
  }
}

/**
 * Runs the call while holding the shared local slot: the lease is renewed
 * during the call, and afterwards the slot is released unless the adapter
 * judged the end uncertain. An outcome reached after the lease lapsed is
 * not used: the adapter decides what the lost lease means, knowing whether
 * the process ended and released the slot. An execution recovery already
 * ended as uncertain keeps that state; its slot is released once its
 * process confirms its end.
 */
async function callOnSlot(
  execution: ExecutionRow,
  adapter: ProviderAdapter | undefined,
  local: LocalClaim,
): Promise<Outcome> {
  const heartbeat = setInterval(() => {
    void renewLocal(local).catch(() => {})
  }, leaseRenewalMs)
  heartbeat.unref()
  let outcome: Outcome
  try {
    outcome = await callProvider(execution, adapter, local)
  } finally {
    clearInterval(heartbeat)
  }
  const ended = outcome.end?.state !== 'uncertain'
  const { held, released } = await transaction(() => finishLocal(local, ended))
  if (!held && adapter)
    outcome = {
      ...outcome,
      result: null,
      end: adapter.endOf({ kind: 'lost_lease', processEnded: released }),
    }
  return outcome
}

/**
 * The confirmed cost from the usage and the saved price list. Usage that is
 * missing or beyond the recorded caps leaves the cost unknown and reserved.
 * Work on a model without a price list costs nothing.
 */
export function settlementOf(
  execution: ExecutionRow,
  outcome: Outcome,
): Settlement {
  const pricing = execution.snapshot.settings.pricing
  const { inputTokens, outputTokens } = outcome.usage
  const known =
    pricing !== null &&
    inputTokens !== null &&
    outputTokens !== null &&
    inputTokens <= pricing.maxInputTokens &&
    outputTokens <= pricing.maxOutputTokens
  return {
    actual:
      outcome.notSent || pricing === null
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
  end: ExecutionEnd | null,
) {
  await transaction(async () => {
    await settleAttempt(execution.id, settlement)
    await finishExecution(execution.id, {
      state: 'retried',
      cause: end?.cause ?? null,
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
 * receiver's decision, or with the end the adapter decided for an outcome
 * without a result. When the receiver throws, everything of this
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
        const end: ExecutionEnd = {
          state: execution.endState ?? 'failed',
          cause: execution.cause ?? 'unknown',
        }
        await receiver.receiveFailure({ ...delivery, ...end })
        await finishExecution(execution.id, end)
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
          : {
              state: 'rejected',
              cause: null,
              rejectionReason: decision.reason,
            },
      )
    })
  } catch (error) {
    await recordFailedDelivery(executionId, deliveryError(error))
    throw error
  }
}

/** Sends again the jobs of the executions waiting for the shared slot. */
export async function wakeLocalQueue() {
  for (const executionId of await queuedLocalExecutions())
    await resendExecutionJob(executionId)
}

/**
 * Handles one job of the AI execution queue. A queued execution is
 * claimed, the provider called once, and the outcome saved before it is
 * delivered; a transient error is retried once as a new attempt of the same
 * operation. An execution waiting for delivery is delivered again without
 * calling the provider.
 */
export async function runExecution(executionId: string): Promise<void> {
  const claimed = await claim(executionId)
  if (claimed) {
    const { execution, local } = claimed
    const adapter = providerAdapter(execution.snapshot.settings.provider)
    const outcome = local
      ? await callOnSlot(execution, adapter, local)
      : await callProvider(execution, adapter, null)
    const settlement = settlementOf(execution, outcome)
    if (outcome.retry && execution.attempt.number < maxAttempts) {
      await delay(outcome.retryAfterMs)
      await retry(execution, settlement, outcome.end)
      return
    }
    await transaction(() =>
      saveOutcome(
        execution.id,
        { result: outcome.result, end: outcome.end },
        settlement,
      ),
    )
    // The slot may be free now; the next local execution takes it.
    if (local) await wakeLocalQueue()
  }
  await deliver(executionId)
}
