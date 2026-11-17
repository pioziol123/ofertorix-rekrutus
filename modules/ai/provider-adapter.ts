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

/** The provider settings fixed when an execution is requested. */
export type ProviderSettings = {
  provider: string
  model: string
  /** The configured endpoint; null means the provider's default one. */
  endpoint: { url: string; credentialEnv: string | null } | null
  maxOutputTokens: number
}

/**
 * The adapter contract of a provider. An adapter declares the execution
 * modes it supports by providing them; coordination never sees the
 * provider's protocol, job states or usage format.
 * Single mode: one request, its result and usage, with errors classified
 * as `ModelError`.
 */
export type ProviderAdapter = {
  provider: string
  single?: (settings: ProviderSettings) => StructuredModel
}

const adapters = new Map<string, ProviderAdapter>()

/** Registers the adapter of a provider where dependencies are composed. */
export function registerProviderAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.provider, adapter)
}

export function providerAdapter(provider: string): ProviderAdapter | undefined {
  return adapters.get(provider)
}
