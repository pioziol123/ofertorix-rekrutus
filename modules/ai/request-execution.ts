import { randomUUID } from 'node:crypto'
import { transaction } from '../../lib/db.ts'
import { admitExecutions, type RequestedExecution } from './admit-executions.ts'
import { checkedValues, type ExecutionCheck } from './check-execution.ts'
import { exceedsInputCap } from './domain/input-cap.ts'
import { schemaValidator } from './domain/response-schema.ts'
import { providerAdapter } from './provider-registry.ts'
import { AiRequestError } from './errors.ts'
import {
  executionSettings,
  type ExecutionSettings,
} from './execution-settings.ts'
import {
  groupRequested,
  hasActiveExecution,
  type ExecutionSnapshot,
} from './infrastructure/persistence/executions.ts'

export type { RequestedExecution } from './admit-executions.ts'

/**
 * How the work runs: one call, an item of a provider batch, or agent work.
 * An agent gathers materials with the allowed tools following the
 * request's instruction, then writes the result in the response schema
 * from what it gathered, following `resultInstruction`. The step that
 * writes the result gets the JSON object `{"target": <the input>,
 * "evidence": <the materials>}`, so `resultInstruction` can name both;
 * the materials reach the client with the result.
 */
export type ExecutionModeRequest =
  | { kind: 'single' }
  | { kind: 'batch'; groupId: string }
  | { kind: 'agent'; tools: string[]; resultInstruction: string }

export type ExecutionRequest = {
  /**
   * The key under which AI keeps the client's execution settings: a name
   * the client defines for itself.
   */
  settingsKey: string
  /** The client's domain operation; it has at most one execution in progress. */
  operationId: string
  /** The client's version of the input, handed back with the result. */
  inputVersion?: string | null
  mode: ExecutionModeRequest
  instruction: string
  responseSchema: { name: string; schema: Record<string, unknown> }
  input: string
  /**
   * Refuse the request with `input_too_large`, before anything is
   * reserved, when its input may take more tokens than the price list's
   * input cap the reservation covers. Without it the work is sent and a
   * usage beyond the cap leaves the cost unknown.
   * ASSUMPTION(oferty-pracy-0mq.21/ASM-5): an option the client chooses.
   */
  refuseAboveInputCap?: boolean
  /**
   * Keep the exact request body and the raw provider response of a
   * single-mode execution in its diagnostic archive, under the execution's
   * archive identifier. Batches are archived whole by their adapter.
   * Solution design 0mq.17 decision 5: the client asks per request,
   * so a client that does not ask is not archived.
   */
  keepArchive?: boolean
  /**
   * The result of the check before the request, for the same settings
   * key. Required when the provider fixes something before a request.
   */
  check?: ExecutionCheck
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validate(request: ExecutionRequest) {
  const mode = request.mode
  if (
    typeof request.settingsKey !== 'string' ||
    !uuid.test(request.operationId) ||
    !request.instruction?.trim() ||
    !request.input?.trim() ||
    !request.responseSchema?.name?.trim() ||
    typeof request.responseSchema.schema !== 'object' ||
    request.responseSchema.schema === null ||
    !Object.keys(request.responseSchema.schema).length ||
    !schemaValidator(request.responseSchema.schema) ||
    (mode.kind === 'batch' && !uuid.test(mode.groupId)) ||
    (mode.kind === 'agent' &&
      (!Array.isArray(mode.tools) ||
        mode.tools.some((t) => typeof t !== 'string' || !t.trim()) ||
        typeof mode.resultInstruction !== 'string' ||
        !mode.resultInstruction.trim()))
  )
    throw new AiRequestError('invalid_request')
}

function snapshot(
  request: ExecutionRequest,
  settings: ExecutionSettings,
): ExecutionSnapshot {
  return {
    fixed: checkedValues(request.check, {
      settingsKey: request.settingsKey,
      provider: settings.provider,
      model: settings.model,
    }),
    kind: 'ai-execution',
    settings,
    instruction: request.instruction,
    responseSchema: request.responseSchema,
    input: request.input,
    tools: request.mode.kind === 'agent' ? request.mode.tools : [],
    ...(request.mode.kind === 'agent'
      ? { resultInstruction: request.mode.resultInstruction }
      : {}),
    ...(request.keepArchive && request.mode.kind === 'single'
      ? { keepArchive: true }
      : {}),
  }
}

/** What the adapter is asked for, from a request and its settings. */
function modelRequest(request: ExecutionRequest, settings: ExecutionSettings) {
  return {
    model: settings.model,
    instructions: request.instruction,
    input: request.input,
    output: request.responseSchema,
  }
}

async function admit(requests: ExecutionRequest[]) {
  for (const request of requests) validate(request)
  const first = requests[0]!
  // Refused before anything is reserved: settings that are missing or
  // invalid, and a mode no adapter of the provider declares.
  const settings = executionSettings(first.settingsKey, first.mode.kind)
  // A reservation covers the input cap of the price list, so a paid
  // request that asks for it is refused above the cap before anything is
  // reserved. ASSUMPTION(oferty-pracy-0mq.21/ASM-5)
  // A batch item is checked by the batch's own admission below; a single
  // request on the exact body its adapter sends, when the adapter measures
  // it.
  const cap = settings.pricing?.maxInputTokens
  const measure = providerAdapter(settings.provider)?.singleRequestBytes
  if (
    cap !== undefined &&
    first.mode.kind === 'single' &&
    requests.some(
      (r) =>
        r.refuseAboveInputCap &&
        exceedsInputCap(r, cap, measure?.(settings, modelRequest(r, settings))),
    )
  )
    throw new AiRequestError('input_too_large')
  // A provider's batch refuses, before anything is reserved, what it
  // cannot take.
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the refusal of the batch mode.
  if (first.mode.kind === 'batch')
    providerAdapter(settings.provider)
      ?.modes.batch?.(settings)
      .admit(
        requests.map((request) => ({
          itemId: request.operationId,
          request: modelRequest(request, settings),
        })),
      )
  const snapshots = requests.map((request) => snapshot(request, settings))
  return transaction(async () => {
    // A group is requested once, so its budget covers the whole group: a
    // second request under the same group ID is refused.
    // ASSUMPTION(oferty-pracy-0mq.21/ASM-7)
    if (
      first.mode.kind === 'batch' &&
      (await groupRequested(first.mode.groupId))
    )
      throw new AiRequestError('group_requested')
    for (const request of requests)
      if (await hasActiveExecution(request.operationId))
        throw new AiRequestError('operation_busy')
    return admitExecutions(
      requests.map((request, index) => ({
        settingsKey: request.settingsKey,
        operationId: request.operationId,
        inputVersion: request.inputVersion ?? null,
        mode: request.mode.kind,
        groupId: request.mode.kind === 'batch' ? request.mode.groupId : null,
        supersedes: null,
        snapshot: snapshots[index]!,
        attempt: 1,
        generation: randomUUID(),
      })),
      settings,
    )
  })
}

/**
 * Requests an execution in the caller's transaction: fixes the settings
 * kept under the client's key and the prices, reserves the budget (or
 * records a wait for it) and sends the job. Rolling back the caller's
 * transaction rolls all of it back.
 */
export async function requestExecution(
  request: ExecutionRequest,
): Promise<RequestedExecution> {
  return (await admit([request]))[0]!
}

/**
 * Requests the items of one provider batch. The reservation covers the
 * whole group or none of it.
 */
export async function requestExecutionGroup(
  requests: ExecutionRequest[],
): Promise<RequestedExecution[]> {
  const first = requests[0]
  if (
    !first ||
    first.mode.kind !== 'batch' ||
    requests.some(
      (r) =>
        r.settingsKey !== first.settingsKey ||
        r.mode.kind !== 'batch' ||
        r.mode.groupId !==
          (first.mode as { kind: 'batch'; groupId: string }).groupId,
    ) ||
    new Set(requests.map((r) => r.operationId)).size !== requests.length
  )
    throw new AiRequestError('invalid_request')
  return admit(requests)
}
