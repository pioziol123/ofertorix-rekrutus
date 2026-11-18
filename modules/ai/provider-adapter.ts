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
  /**
   * The input cap of the price list, in tokens; 0 when the model has no
   * price list. Absent in settings fixed before it was recorded.
   */
  maxInputTokens?: number
  /** The local runtime from the AI configuration; null for a remote model. */
  runtime: LocalRuntime | null
}

/**
 * What an adapter observed when the work ended without a result: a
 * response the model did not complete, an error, or a lost lease of a
 * running process on the shared local slot. For a lost lease,
 * `processEnded` says whether the end of the process was observed and the
 * slot released.
 */
export type ProviderObservation =
  | { kind: 'outcome'; outcome: 'refused' | 'incomplete' | 'no_content' }
  | { kind: 'error'; error: unknown }
  | { kind: 'lost_lease'; processEnded: boolean }

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
  /**
   * Keeps an exact provider artefact (the request body sent, the raw
   * response received) in the execution's diagnostic archive. Given only
   * when the client asked for the archive.
   */
  keepArtifact?: (
    kind: 'input' | 'output',
    key: string,
    content: string,
  ) => Promise<void>
}

/** One item of a provider batch: its identifier and its request. */
export type BatchItem = { itemId: string; request: ModelRequest }

/**
 * A request body a client saved before AI archived batch inputs, with the
 * item id it was sent under.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-8)
 */
export type SavedBatchBody = { itemId: string; body: unknown }

/**
 * What a batch delivered for one item: a response the coordination reads
 * like that of a single call, or an end the adapter decided, with the usage
 * it knows. `notCharged` says the provider charges nothing for the item.
 */
export type BatchItemOutcome =
  | { kind: 'response'; response: ModelResult }
  | {
      kind: 'end'
      end: ExecutionEnd
      usage: ModelUsage
      responseId: string | null
      notCharged: boolean
    }

/**
 * A step of a batch: the work goes on at the provider (or belongs to the
 * run sending it), or the batch ended with an outcome for every item.
 */
export type BatchStep =
  | { kind: 'wait' }
  | {
      kind: 'ended'
      outcomes: Map<string, BatchItemOutcome>
      /** The adapter's state of the ended batch, saved with the outcomes. */
      state: unknown
    }

/** What the coordination gives a batch adapter for one step of a group. */
export type BatchContext = {
  /** The group the client requested the items in. */
  groupId: string
  /**
   * The adapter's own state of the group, as it last saved it; null before
   * its first save. Only the adapter reads it.
   */
  state: unknown
  /** True only for the run that took the group's queued items. */
  claimed: boolean
  /**
   * Saves the adapter's next state when no other run changed it since this
   * step read it; false when another run did, and the step should stop.
   */
  save: (next: unknown) => Promise<boolean>
  /** Keeps a raw provider artefact in the group's diagnostic archive. */
  archive: (
    kind: 'input' | 'output' | 'error' | 'metadata',
    key: string,
    content: string,
  ) => Promise<void>
}

/**
 * The batch mode of an adapter: the provider's cycle of sending, polling,
 * collecting and cleaning up a batch.
 * - `admit`: refuses, at request time, requests the provider's batch
 *   cannot take (`AiRequestError` with `input_too_large` for an item
 *   above the input cap, ASSUMPTION(oferty-pracy-0mq.21/ASM-5);
 *   `batch_too_large` for too many items or bytes,
 *   ASSUMPTION(oferty-pracy-0mq.21/ASM-4)).
 * - `advance`: carries the group one step further.
 * - `cleanup`: removes what the batch left at the provider once its
 *   outcomes are saved; `needsCleanup` says whether a saved state still
 *   needs it.
 */
export type BatchRunner = {
  admit: (items: BatchItem[]) => void
  advance: (items: BatchItem[], context: BatchContext) => Promise<BatchStep>
  cleanup: (context: BatchContext) => Promise<void>
  needsCleanup: (state: unknown) => boolean
}

/**
 * The adapter contract of a provider. Coordination never sees the
 * provider's protocol, job states or usage format.
 * - `modes`: the execution modes the adapter supports, by providing them.
 *   Single mode: one request, its result and usage, with errors classified
 *   as `ModelError`. Batch: the provider's batch cycle (`BatchRunner`).
 *   The agent mode comes with its adapter.
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
 * - `singleRequestBytes`: the UTF-8 size of the exact body single mode
 *   sends for a request, so the input cap is checked on what the provider
 *   receives, as the batch mode's `admit` checks its exact batch line
 *   (ASSUMPTION(oferty-pracy-0mq.21/ASM-5)).
 * - `reconstructBatchInput`: the batch input file rebuilt from request
 *   bodies saved before the archive kept inputs, framed as the batch mode
 *   frames its lines (ASSUMPTION(oferty-pracy-0mq.21/ASM-8)).
 */
export type ProviderAdapter = {
  provider: string
  modes: {
    single?: (
      settings: ProviderSettings,
      context: RequestContext,
    ) => StructuredModel
    batch?: (settings: ProviderSettings) => BatchRunner
  }
  endOf: (observation: ProviderObservation) => ExecutionEnd
  sharedSlot?: boolean
  check?: (settings: ProviderSettings) => Promise<Record<string, unknown>>
  ready?: (settings: ProviderSettings) => boolean
  singleRequestBytes?: (
    settings: ProviderSettings,
    request: ModelRequest,
  ) => number
  reconstructBatchInput?: (bodies: SavedBatchBody[]) => string
}
