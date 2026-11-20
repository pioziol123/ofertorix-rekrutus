import { setTimeout as delay } from 'node:timers/promises'
import { transaction } from '../../lib/db.ts'
import { admitExecutions } from './admit-executions.ts'
import { archiveArtifact } from './infrastructure/persistence/batch-archive.ts'
import { chargeCost } from './domain/cost.ts'
import type { ExecutionEnd } from './domain/execution-state.ts'
import { parseResult } from './domain/response-schema.ts'
import { sendExecutionJob, type ExecutionJobData } from './execution-jobs.ts'
import {
  claimDelivery,
  claimExecution,
  finishExecution,
  finishRunning,
  readExecutionRow,
  recordFailedDelivery,
  saveAdapterState,
  saveOutcome,
  settleAttempt,
  settleSavedAttempt,
  type ExecutionRow,
  type Settlement,
} from './infrastructure/persistence/executions.ts'
import {
  emptyUsage,
  ModelError,
  type AgentMaterial,
  type ModelResult,
  type ModelUsage,
  type ProviderAdapter,
} from './provider-adapter.ts'
import { providerAdapter } from './provider-registry.ts'
import { resultReceiver } from './result-receiver.ts'
import { carryOutBatchItem } from './run-batch.ts'

/** The attempts an operation gets for transient errors, as before. */
const maxAttempts = 2

export type Outcome = {
  /** The parsed result, or null when the execution ended without one. */
  result: unknown
  /** The end the adapter decided for an outcome without a result. */
  end: ExecutionEnd | null
  usage: ModelUsage
  responseId: string | null
  /** Nothing reached the provider, so nothing was spent. */
  notSent: boolean
  /**
   * ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
   * A request was sent whose usage is not known: the cost stays unknown
   * and reserved, although the usage measured for other steps is kept.
   */
  unmeasured: boolean
  retry: boolean
  retryAfterMs: number
}

export const noOutcome = (): Outcome => ({
  result: null,
  end: null,
  usage: emptyUsage(),
  responseId: null,
  notSent: false,
  unmeasured: false,
  retry: false,
  retryAfterMs: 1000,
})

/**
 * The end of work AI cannot tell the course of: an execution found running
 * by a new attempt, or left waiting or running after its job's last attempt
 * failed (B6-R05, B6-R07, B6-D02). AI does not deduce that the work was
 * interrupted.
 */
export const unknownEnd: ExecutionEnd = { state: 'uncertain', cause: 'unknown' }

/**
 * Ends an execution in one of the `from` states as uncertain with the cause
 * unknown, keeping its reservation (nothing is charged beyond what was
 * saved), and sends the job that delivers that end to the client. It calls
 * no provider. A conditional write: false, with no effect, when the
 * execution is in no such state. Runs in the caller's transaction.
 */
export async function endAsUnknown(
  execution: ExecutionRow,
  from: readonly ('queued' | 'running')[] = ['running'],
): Promise<boolean> {
  const outcome = { ...noOutcome(), end: unknownEnd }
  const saved = await saveOutcome(
    execution.id,
    { result: null, end: unknownEnd },
    settlementOf(execution, outcome),
    from,
  )
  if (saved)
    await sendExecutionJob(execution.id, execution.snapshot.settings)
  return saved
}

/** A raw provider response a paid run received, kept in memory. */
type RawResponse = { key: string; content: string }

/**
 * The keeper of the provider's artefacts for a paid run: it writes them to
 * the execution's archive when the client asked for it, and always holds
 * the raw responses, so that a run that may no longer save its outcome can
 * still archive what the provider returned (B6-R06).
 */
function artefactKeeper(execution: ExecutionRow, responses: RawResponse[]) {
  return async (kind: 'input' | 'output', key: string, content: string) => {
    if (kind === 'output') responses.push({ key, content })
    if (execution.snapshot.keepArchive)
      await transaction(() => archiveArtifact(execution.id, kind, key, content))
  }
}

/**
 * Keeps the raw responses of a run whose execution ended meanwhile in the
 * execution's archive; a client that asked for the archive has them there
 * already (B6-R06).
 */
async function archiveLate(execution: ExecutionRow, responses: RawResponse[]) {
  if (execution.snapshot.keepArchive) return
  await transaction(async () => {
    for (const response of responses)
      await archiveArtifact(
        execution.id,
        'output',
        response.key,
        response.content,
      )
  })
}

/**
 * What a provider's response means: a result that matches the response
 * schema, or the end the adapter decides for a response the model refused,
 * did not complete or left without content. Single calls and batch items
 * read their responses the same way.
 */
export function responseOutcome(
  response: ModelResult,
  adapter: ProviderAdapter,
  schema: Record<string, unknown>,
): Outcome {
  const outcome = {
    ...noOutcome(),
    usage: response.usage,
    responseId: response.responseId,
  }
  if (response.outcome !== 'completed')
    return {
      ...outcome,
      end: adapter.endOf({ kind: 'outcome', outcome: response.outcome }),
    }
  // A completed response without content: the adapter says what it means.
  if (response.text === null)
    return {
      ...outcome,
      end: adapter.endOf({ kind: 'outcome', outcome: 'no_content' }),
    }
  // Only a result that matches the response schema reaches the receiver.
  const result = parseResult(response.text, schema)
  return result === undefined
    ? { ...outcome, end: { state: 'failed', cause: 'format' } }
    : { ...outcome, result }
}

/**
 * Runs agent work through its adapter once. The adapter saves its own
 * state as it goes, and decides the end of work that gave no response;
 * an error it throws is translated like that of a single call, and the
 * cost then stays unknown. ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
 */
async function callAgent(
  execution: ExecutionRow,
  adapter: ProviderAdapter,
  paid: PaidRun | null,
): Promise<Outcome> {
  const { settings, instruction, input, responseSchema } = execution.snapshot
  const agent = adapter.modes.agent!(settings)
  try {
    const work = await agent.run(
      {
        model: settings.model,
        instructions: instruction,
        resultInstructions: execution.snapshot.resultInstruction ?? '',
        input,
        output: responseSchema,
        tools: execution.snapshot.tools,
      },
      {
        // A save after the execution ended fails, and the adapter sends
        // nothing more (B6-R06).
        save: async (state) => {
          if (!(await transaction(() => saveAdapterState(execution.id, state))))
            throw new Error('The execution no longer runs')
        },
        ...(paid
          ? { keepArtifact: artefactKeeper(execution, paid.responses) }
          : {}),
      },
    )
    const measured = {
      usage: work.usage,
      responseId: work.responseIds.join(',') || null,
      unmeasured: work.unmeasured,
    }
    if (work.kind === 'end')
      return { ...noOutcome(), ...measured, end: work.end }
    return {
      ...responseOutcome(work.response, adapter, responseSchema.schema),
      ...measured,
    }
  } catch (error) {
    return {
      ...noOutcome(),
      end: adapter.endOf({ kind: 'error', error }),
      unmeasured: true,
    }
  }
}

/** A paid run: the raw responses it received. */
type PaidRun = { responses: RawResponse[] }

/** Calls the provider through its adapter and classifies what happened. */
async function callProvider(
  execution: ExecutionRow,
  adapter: ProviderAdapter | undefined,
  paid: PaidRun | null,
): Promise<Outcome> {
  const { settings, instruction, input, responseSchema } = execution.snapshot
  const outcome = noOutcome()
  // A request is accepted only in a mode the adapter declares (refused
  // otherwise with unsupported_mode, before any reservation). An adapter
  // that no longer declares it when the job runs is a failure on the AI
  // side with its own cause; nothing reached a provider.
  const single = execution.mode === 'single' ? adapter?.modes.single : undefined
  const agent = execution.mode === 'agent' ? adapter?.modes.agent : undefined
  // ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
  if (adapter && agent) return callAgent(execution, adapter, paid)
  if (!adapter || !single)
    return {
      ...outcome,
      end: { state: 'failed', cause: 'adapter_unavailable' },
      notSent: true,
    }
  try {
    const response = await single(settings, {
      fixed: execution.snapshot.fixed ?? {},
      // Archived when the client asked for it (SD 0mq.17 decision 5); a
      // paid run also holds the raw response in case its execution ends
      // meanwhile (B6-R06).
      ...(paid
        ? { keepArtifact: artefactKeeper(execution, paid.responses) }
        : execution.snapshot.keepArchive
          ? {
              keepArtifact: (
                kind: 'input' | 'output',
                key: string,
                content: string,
              ) =>
                transaction(() =>
                  archiveArtifact(execution.id, kind, key, content),
                ),
            }
          : {}),
      // The raw response of the local model is always kept in the
      // execution's archive.
      ...(paid
        ? {}
        : {
            archive: (raw: string) =>
              transaction(() =>
                archiveArtifact(execution.id, 'output', 'response', raw),
              ),
          }),
    }).generate({
      model: settings.model,
      instructions: instruction,
      input,
      output: responseSchema,
    })
    return responseOutcome(response, adapter, responseSchema.schema)
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
  // Calls of a paid tool count only under a price list that has one.
  // ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
  const toolCalls = pricing?.toolCallUsd
    ? outcome.usage.toolCalls === undefined
      ? 0
      : outcome.usage.toolCalls
    : 0
  const known =
    pricing !== null &&
    !outcome.unmeasured &&
    inputTokens !== null &&
    outputTokens !== null &&
    toolCalls !== null &&
    inputTokens <= pricing.maxInputTokens &&
    outputTokens <= pricing.maxOutputTokens &&
    toolCalls <= (pricing.maxToolCalls ?? 0)
  return {
    actual:
      outcome.notSent || pricing === null
        ? '0.000000'
        : known
          ? chargeCost(pricing, {
              input: inputTokens,
              output: outputTokens,
              toolCalls,
            })
          : null,
    usage: outcome.usage,
    responseId: outcome.responseId,
  }
}

/**
 * Ends the attempt and requests the next one of the same operation, while
 * the execution still runs; false when it ended meanwhile.
 */
async function retry(
  execution: ExecutionRow,
  settlement: Settlement,
  end: ExecutionEnd | null,
): Promise<boolean> {
  return transaction(async () => {
    if (!(await finishRunning(execution.id, end?.cause ?? null))) return false
    await settleAttempt(execution.id, settlement)
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
    return true
  })
}

/**
 * The materials agent work gathered, read by the adapter that saved them.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
 */
function materialsOf(execution: ExecutionRow): AgentMaterial[] {
  const settings = execution.snapshot.settings
  const agent = providerAdapter(settings.provider)?.modes.agent
  if (!agent) throw new Error('No agent adapter for the execution')
  return agent(settings).materials(execution.adapterState)
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
        // ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the materials of agent work.
        ...(execution.mode === 'agent'
          ? { materials: materialsOf(execution) }
          : {}),
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

/**
 * The job handler of both AI queues (B6-R02, B6-R03, B6-R05). A queued
 * execution is claimed, the provider called once, and the outcome saved
 * before it is delivered; a transient error is retried once as a new
 * attempt of the same operation. An execution waiting for delivery is
 * delivered again without calling the provider; a delivery error throws,
 * so the queue retries the job.
 *
 * Exclusivity in the queue means that an execution found running was left
 * by an attempt that has ended: it ends as uncertain with the cause
 * unknown, and the job that delivers that end is sent. A paid run whose
 * save finds the execution ended keeps the raw responses it received in the
 * execution's archive and ends without effect (B6-R06).
 */
export async function runExecution({
  executionId,
}: ExecutionJobData): Promise<void> {
  const row = await readExecutionRow(executionId)
  if (row?.state === 'delivering') return deliver(executionId)
  // An item of a provider batch moves with its group; its own job then
  // delivers its outcome.
  if (row?.mode === 'batch' && row.groupId) {
    await carryOutBatchItem(row.groupId)
    await deliver(executionId)
    return
  }
  const execution = await transaction(() => claimExecution(executionId))
  if (!execution) {
    if (row?.state === 'running')
      await transaction(() => endAsUnknown(row, ['running']))
    return
  }
  if (await carryOut(execution)) await deliver(executionId)
}

/**
 * Calls the provider and saves its outcome, or retries it. True when the
 * outcome was saved and waits for delivery; false when the work was
 * retried, or when the execution had ended meanwhile, for paid work with
 * the raw responses kept in its archive instead.
 */
async function carryOut(execution: ExecutionRow): Promise<boolean> {
  const adapter = providerAdapter(execution.snapshot.settings.provider)
  const paid: PaidRun | null = adapter?.sharedSlot ? null : { responses: [] }
  const outcome = await callProvider(execution, adapter, paid)
  const settlement = settlementOf(execution, outcome)
  let kept: boolean
  if (outcome.retry && execution.attempt.number < maxAttempts) {
    await delay(outcome.retryAfterMs)
    if (!(await retry(execution, settlement, outcome.end))) kept = false
    else return false
  } else
    kept = await transaction(() =>
      saveOutcome(
        execution.id,
        { result: outcome.result, end: outcome.end },
        settlement,
      ),
    )
  if (!kept && paid) await archiveLate(execution, paid.responses)
  return kept
}
