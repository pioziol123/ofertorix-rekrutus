import { randomUUID } from 'node:crypto'
import { transaction } from '../../lib/db.ts'
import { admitExecutions, type RequestedExecution } from './admit-executions.ts'
import { schemaValidator } from './domain/response-schema.ts'
import { AiRequestError } from './errors.ts'
import {
  executionSettings,
  type ExecutionSettings,
} from './execution-settings.ts'
import {
  hasActiveExecution,
  type ExecutionSnapshot,
} from './infrastructure/persistence/executions.ts'

export type { RequestedExecution } from './admit-executions.ts'

/** How the work runs: one call, an item of a provider batch, or agent work. */
export type ExecutionModeRequest =
  | { kind: 'single' }
  | { kind: 'batch'; groupId: string }
  | { kind: 'agent'; tools: string[] }

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
      (!Array.isArray(mode.tools) || mode.tools.some((t) => !t.trim())))
  )
    throw new AiRequestError('invalid_request')
}

function snapshot(
  request: ExecutionRequest,
  settings: ExecutionSettings,
): ExecutionSnapshot {
  return {
    kind: 'ai-execution',
    settings,
    instruction: request.instruction,
    responseSchema: request.responseSchema,
    input: request.input,
    tools: request.mode.kind === 'agent' ? request.mode.tools : [],
  }
}

async function admit(requests: ExecutionRequest[]) {
  for (const request of requests) validate(request)
  const first = requests[0]!
  // Refused before anything is reserved: settings that are missing or
  // invalid, and a mode no adapter of the provider declares.
  const settings = executionSettings(first.settingsKey, first.mode.kind)
  return transaction(async () => {
    for (const request of requests)
      if (await hasActiveExecution(request.operationId))
        throw new AiRequestError('operation_busy')
    return admitExecutions(
      requests.map((request) => ({
        settingsKey: request.settingsKey,
        operationId: request.operationId,
        inputVersion: request.inputVersion ?? null,
        mode: request.mode.kind,
        groupId: request.mode.kind === 'batch' ? request.mode.groupId : null,
        supersedes: null,
        snapshot: snapshot(request, settings),
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
