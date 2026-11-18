import type { ExecutionEnd } from './domain/execution-state.ts'

export type ModelRequest = {
  model: string
  instructions: string
  input: string
  output: { name: string; schema: Record<string, unknown> }
}
export type ModelUsage = {
  inputTokens: number | null
  outputTokens: number | null
}
export type ModelResult = {
  outcome: 'completed' | 'refused' | 'incomplete'
  text: string | null
  usage: ModelUsage
  responseId: string | null
}
export type StructuredModel = {
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResult>
}
export type ModelErrorCode =
  | 'configuration'
  | 'network'
  | 'http'
  | 'format'
  | 'aborted'
  | 'model_unavailable'
  | 'context_overflow'
/**
 * An adapter's error. Its details are the adapter's own record of what it
 * observed; only the adapter reads them to decide the public end (`endOf`).
 * Coordination reads only the judgement whether a retry is worth it, the
 * suggested wait and the usage.
 */
export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    readonly details: {
      requestSent?: boolean
      responseReceived?: boolean
      httpStatus?: number
      retryAfterMs?: number | null
      /**
       * The adapter's judgement that sending the same request again may
       * succeed, after `retryAfterMs` when given. Coordination decides on
       * retries only from this, never from the provider's protocol.
       */
      transient?: boolean
      responseId?: string | null
      usage?: ModelUsage
      runtimeEnded?: boolean
    } = {},
    options?: ErrorOptions,
  ) {
    super(`AI ${code}`, options)
  }
}
export const emptyUsage = (): ModelUsage => ({
  inputTokens: null,
  outputTokens: null,
})

/** The local runtime of a model that runs on the installation's hardware. */
export type LocalRuntime = {
  endpointRef: string
  endpointVersion: number
  numCtx: number
}

/** The provider settings fixed when an execution is requested. */
export type ProviderSettings = {
  provider: string
  model: string
  /** The reasoning effort the client chose; null sends none. */
  reasoningEffort: string | null
  maxOutputTokens: number
  /** The local runtime from the AI configuration; null for a remote model. */
  runtime: LocalRuntime | null
}

/**
 * What an adapter observed when the work ended without a result: a
 * response the model did not complete, an error, or a lost lease of a
 * running process on the shared local slot.
 */
export type ProviderObservation =
  | { kind: 'outcome'; outcome: 'refused' | 'incomplete' }
  | { kind: 'error'; error: unknown }
  | { kind: 'lost_lease' }

/** What the coordination gives an adapter for one request. */
export type RequestContext = {
  /**
   * What the adapter fixed with its check before the request. Only the
   * adapter reads it; for the coordination and the client it is opaque.
   */
  fixed: Record<string, unknown>
  /**
   * Called right before the request is sent; false means the request may
   * no longer be sent, e.g. the lease of the shared local slot lapsed.
   */
  beforeSend?: () => Promise<boolean>
  /** Keeps the raw response of the provider with the execution. */
  archive?: (raw: string) => Promise<void>
}

/**
 * The adapter contract of a provider. Coordination never sees the
 * provider's protocol, job states or usage format.
 * - `modes`: the execution modes the adapter supports, by providing them.
 *   Single mode: one request, its result and usage, with errors classified
 *   as `ModelError`. Batch and agent modes come with their adapters.
 * - `endOf`: the one place where the adapter decides which public state
 *   and cause what it observed means. Coordination saves what it returns
 *   and does not branch on provider facts.
 * - `sharedSlot`: the provider runs on the installation's one shared local
 *   slot, so its executions take the slot in request order.
 * - `check`: fixes, before a request and outside any transaction, what the
 *   adapter needs carried to the execution (e.g. the version of a local
 *   model). It refuses with `AiRequestError`.
 * - `ready`: whether the provider's runtime is configured, without calling
 *   it.
 */
export type ProviderAdapter = {
  provider: string
  modes: {
    single?: (
      settings: ProviderSettings,
      context: RequestContext,
    ) => StructuredModel
  }
  endOf: (observation: ProviderObservation) => ExecutionEnd
  sharedSlot?: boolean
  check?: (settings: ProviderSettings) => Promise<Record<string, unknown>>
  ready?: (settings: ProviderSettings) => boolean
}
