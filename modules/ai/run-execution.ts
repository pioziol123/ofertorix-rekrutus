import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { transaction } from '../../lib/db.ts'
import { admitExecutions } from './admit-executions.ts'
import { archiveArtifact } from './infrastructure/persistence/batch-archive.ts'
import { chargeCost } from './domain/cost.ts'
import { executionLease } from './domain/execution-lease.ts'
import type { ExecutionEnd } from './domain/execution-state.ts'
import { parseResult } from './domain/response-schema.ts'
import { resendExecutionJob } from './execution-queue.ts'
import {
  claimDelivery,
  claimExecution,
  finishExecution,
  finishRunning,
  readExecutionRow,
  recordFailedDelivery,
  renewLease,
  saveAdapterState,
  saveOutcome,
  settleAttempt,
  settleSavedAttempt,
  type EndGuard,
  type ExecutionLease,
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
  type AgentMaterial,
  type ModelResult,
  type ModelUsage,
  type ProviderAdapter,
} from './provider-adapter.ts'
import { providerAdapter } from './provider-registry.ts'
import { resultReceiver } from './result-receiver.ts'
import { runBatch } from './run-batch.ts'

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

/** A new lease of paid work, owned by the run that takes it. */
export function newLease(): ExecutionLease {
  return { owner: randomUUID(), seconds: executionLease.durationSeconds }
}

/**
 * Runs the work while renewing the lease, so that recovery does not take
 * a live worker for a lost one, however long the provider takes.
 */
export async function whileLeased<T>(
  lease: ExecutionLease,
  work: () => Promise<T>,
): Promise<T> {
  const heartbeat = setInterval(() => {
    void renewLease(lease).catch(() => {})
  }, executionLease.renewEveryMs)
  heartbeat.unref()
  try {
    return await work()
  } finally {
    clearInterval(heartbeat)
  }
}

/**
 * Takes a queued execution for work. An execution of a provider on the
 * shared local slot is taken only together with the slot, in request
 * order; otherwise it stays queued until the slot is free. Any other
 * execution is paid work and is taken under a lease (SD 0mq.15 decision 2).
 */
async function claim(executionId: string) {
  return transaction(async () => {
    const queued = await readExecutionRow(executionId)
    if (queued?.state !== 'queued') return null
    let local: LocalClaim | null = null
    let lease: ExecutionLease | null = null
    if (providerAdapter(queued.snapshot.settings.provider)?.sharedSlot) {
      local = await claimLocalSlot(executionId)
      if (!local) return null
    } else lease = newLease()
    const execution = await claimExecution(executionId, lease)
    return execution ? { execution, local, lease } : null
  })
}

/** A raw provider response a paid run received, kept in memory. */
type RawResponse = { key: string; content: string }

/**
 * The keeper of the provider's artefacts for a paid run: it writes them to
 * the execution's archive when the client asked for it, and always holds
 * the raw responses, so that a run that may no longer save its outcome can
 * still archive what the provider returned (SD 0mq.15 decision 3).
 */
function artefactKeeper(execution: ExecutionRow, responses: RawResponse[]) {
  return async (kind: 'input' | 'output', key: string, content: string) => {
    if (kind === 'output') responses.push({ key, content })
    if (execution.snapshot.keepArchive)
      await transaction(() => archiveArtifact(execution.id, kind, key, content))
  }
}

/**
 * Keeps the raw responses of a run that lost its execution in the
 * execution's archive; a client that asked for the archive has them there
 * already.
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
        // The lease is renewed across all steps; a save after recovery
        // ended the work fails, and the adapter sends nothing more.
        save: async (state) => {
          if (
            !(await transaction(() =>
              saveAdapterState(execution.id, state, paid?.guard),
            ))
          )
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

/**
 * A paid run: who may end the execution (the holder of its lease) and the
 * raw responses the run received.
 */
type PaidRun = { guard: EndGuard; responses: RawResponse[] }

/** Calls the provider through its adapter and classifies what happened. */
async function callProvider(
  execution: ExecutionRow,
  adapter: ProviderAdapter | undefined,
  local: LocalClaim | null,
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
      // paid run also holds the raw response in case it loses the
      // execution (SD 0mq.15 decision 3).
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
    outcome = await callProvider(execution, adapter, local, null)
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
 * Ends the attempt and requests the next one of the same operation. A paid
 * run does so only while it still holds the execution's lease; false when
 * recovery ended the execution first.
 */
async function retry(
  execution: ExecutionRow,
  settlement: Settlement,
  end: ExecutionEnd | null,
  guard: EndGuard | undefined,
): Promise<boolean> {
  return transaction(async () => {
    const cause = end?.cause ?? null
    if (guard) {
      if (!(await finishRunning(execution.id, cause, guard))) return false
    } else await finishExecution(execution.id, { state: 'retried', cause })
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
 *
 * Paid work runs under the execution's lease, renewed until its outcome is
 * saved. A paid run that finds the execution ended by recovery meanwhile
 * keeps the raw responses it received in the execution's archive and ends
 * without saving or delivering anything.
 */
export async function runExecution(executionId: string): Promise<void> {
  // An item of a provider batch moves with its group; its own job then
  // delivers its outcome.
  const row = await readExecutionRow(executionId)
  if (row?.mode === 'batch' && row.groupId) {
    await runBatch(row.groupId)
    await deliver(executionId)
    return
  }
  const claimed = await claim(executionId)
  if (claimed?.lease) {
    const { execution, lease } = claimed
    const kept = await whileLeased(lease, () => runPaid(execution, lease))
    if (!kept) return
  } else if (claimed?.local) {
    const { execution, local } = claimed
    const adapter = providerAdapter(execution.snapshot.settings.provider)
    const outcome = await callOnSlot(execution, adapter, local)
    const settlement = settlementOf(execution, outcome)
    if (outcome.retry && execution.attempt.number < maxAttempts) {
      await delay(outcome.retryAfterMs)
      await retry(execution, settlement, outcome.end, undefined)
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
    await wakeLocalQueue()
  }
  await deliver(executionId)
}

/**
 * Calls the provider for paid work and saves its outcome, or retries it,
 * as the holder of the lease. True when the outcome was saved and waits
 * for delivery; false when the work was retried, or when recovery had
 * ended it and the raw responses went to the archive instead.
 */
async function runPaid(
  execution: ExecutionRow,
  lease: ExecutionLease,
): Promise<boolean> {
  const paid: PaidRun = { guard: { holder: lease.owner }, responses: [] }
  const adapter = providerAdapter(execution.snapshot.settings.provider)
  const outcome = await callProvider(execution, adapter, null, paid)
  const settlement = settlementOf(execution, outcome)
  if (outcome.retry && execution.attempt.number < maxAttempts) {
    await delay(outcome.retryAfterMs)
    if (!(await retry(execution, settlement, outcome.end, paid.guard)))
      await archiveLate(execution, paid.responses)
    return false
  }
  const saved = await transaction(() =>
    saveOutcome(
      execution.id,
      { result: outcome.result, end: outcome.end },
      settlement,
      paid.guard,
    ),
  )
  if (!saved) await archiveLate(execution, paid.responses)
  return saved
}
