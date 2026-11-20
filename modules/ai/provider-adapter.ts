import type { AgentTool } from './domain/execution-mode.ts'
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
  /**
   * Calls of a paid tool (agent mode); absent when none was used.
   * ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
   */
  toolCalls?: number | null
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
  /**
   * The most calls of a paid tool the reservation covers (agent mode);
   * absent when the price list covers no paid tool.
   * ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
   */
  maxToolCalls?: number
  /** The local runtime from the AI configuration; null for a remote model. */
  runtime: LocalRuntime | null
}

/**
 * What an adapter observed when the work ended without a result: a
 * response the model did not complete, or an error. Work found running by
 * a new attempt is not an observation of the adapter: it ends as uncertain
 * with the cause unknown (B6-D02).
 */
export type ProviderObservation =
  | { kind: 'outcome'; outcome: 'refused' | 'incomplete' | 'no_content' }
  | { kind: 'error'; error: unknown }

/** What the coordination gives an adapter for one request. */
export type RequestContext = {
  /**
   * What the adapter fixed with its check before the request. Only the
   * adapter reads it; for the coordination and the client it is opaque.
   */
  fixed: Record<string, unknown>
  /**
   * Keeps the raw response of the provider in the execution's archive;
   * given for every run on the local model.
   */
  archive?: (raw: string) => Promise<void>
  /**
   * Keeps an exact provider artefact (the request body sent, the raw
   * response received) for the execution's diagnostic archive. Given when
   * the client asked for the archive, and for every paid run: the
   * coordination archives a paid run's raw response also when the run
   * finds its execution already ended (B6-R06).
   */
  keepArtifact?: (
    kind: 'input' | 'output',
    key: string,
    content: string,
  ) => Promise<void>
}

// ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the agent mode below: its request,
// its materials and its runner, which keeps them in its own state.
/** A source an agent's tool opened or found, cited by a material. */
export type AgentSource = {
  url: string
  title: string
  /** An opened page, or a result of a search seen only as a snippet. */
  kind: 'page' | 'search_snippet'
  accessedAt: string
}

/**
 * A unit of material an agent gathered with its tools: a text and the
 * sources it cites. The agent's result refers to a material by its id.
 */
export type AgentMaterial = {
  id: number
  text: string
  sources: AgentSource[]
}

/**
 * The work of an agent: it gathers materials with the allowed tools
 * following `instructions`, then writes the result from them following
 * `resultInstructions`, in the response schema.
 */
export type AgentRequest = ModelRequest & {
  resultInstructions: string
  tools: AgentTool[]
}

/** One step of agent work as the adapter observed it. */
export type AgentStep = {
  step: string
  status: 'sent' | 'completed' | 'failed' | 'unknown'
  responseId: string | null
  usage: ModelUsage
}

/**
 * What agent work delivered: the response of its last step, read like
 * that of a single call, or an end the adapter decided before it. `usage`
 * sums the measured steps; `unmeasured` says a step was sent whose usage
 * is not known, so the cost of the work stays unknown and reserved
 * although the usage of the other steps is kept.
 */
export type AgentOutcome = (
  | { kind: 'response'; response: ModelResult }
  | { kind: 'end'; end: ExecutionEnd }
) & {
  usage: ModelUsage
  unmeasured: boolean
  responseIds: string[]
}

/** What the coordination gives an agent adapter for one execution. */
export type AgentContext = {
  /**
   * Saves the adapter's own state of the execution (its step log, the
   * materials) while the execution runs; it throws when the execution no
   * longer runs, and the adapter sends nothing more.
   */
  save: (state: unknown) => Promise<void>
  /**
   * Keeps an exact provider artefact, such as the raw response of a step,
   * before the adapter reads it, as `RequestContext.keepArtifact` does for
   * a single call.
   */
  keepArtifact?: RequestContext['keepArtifact']
}

/**
 * The agent mode of an adapter.
 * - `tools`: the tools the agent offers; a request naming another is
 *   refused with `unsupported_mode` before anything is reserved.
 * - `fits`: whether the settings let the agent run its steps (the model,
 *   the token caps and the tool calls the reservation covers); a request
 *   under settings that do not fit is refused with `not_configured`.
 * - `run`: carries the work out once, saving its state before each step
 *   is sent and after its response, and never sends a step again.
 * - `materials`: the materials of the work, read from the state the
 *   adapter saved; they reach the client with the result.
 */
export type AgentRunner = {
  /** The tools of the public list the agent offers. */
  tools: readonly AgentTool[]
  fits: () => boolean
  run: (request: AgentRequest, context: AgentContext) => Promise<AgentOutcome>
  materials: (state: unknown) => AgentMaterial[]
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
 * - `sending`: whether a saved state (null before the first save) shows a
 *   group still being sent, before the provider's batch identifier was
 *   saved. Only the job that took the group sends it; a group found still
 *   being sent by another job ends as uncertain, and a group already sent
 *   is left to polling by the periodic process (B6-R05, B6-D03).
 */
export type BatchRunner = {
  admit: (items: BatchItem[]) => void
  advance: (items: BatchItem[], context: BatchContext) => Promise<BatchStep>
  cleanup: (context: BatchContext) => Promise<void>
  needsCleanup: (state: unknown) => boolean
  sending: (state: unknown) => boolean
}

/**
 * The adapter contract of a provider. Coordination never sees the
 * provider's protocol, job states or usage format.
 * - `modes`: the execution modes the adapter supports, by providing them.
 *   Single mode: one request, its result and usage, with errors classified
 *   as `ModelError`. Batch: the provider's batch cycle (`BatchRunner`).
 *   Agent: gathering materials with tools and writing the result from
 *   them (`AgentRunner`).
 * - `endOf`: where the adapter decides which public state and cause what
 *   it observed in single and batch mode means, and an error an agent
 *   runner throws. Coordination saves what it returns and does not branch
 *   on provider facts. An agent runner decides the end of its own steps
 *   inside the adapter and returns it as an `AgentOutcome` of kind `end`
 *   (ASSUMPTION(oferty-pracy-0mq.22/ASM-3)); a batch runner does the same
 *   for its items.
 * - `sharedSlot`: the provider runs on the installation's one local
 *   model, so its executions go to the queue of the local model, carried
 *   out one at a time in request order (B6-R02).
 * - `check`: fixes, before a request and outside any transaction, what the
 *   adapter needs carried to the execution (e.g. the version of a local
 *   model). It refuses with `AiRequestError`.
 * - `ready`: whether the provider's runtime is configured, without calling
 *   it.
 * - `singleRequestBytes`: the UTF-8 size of the exact body single mode
 *   sends for a request, so the input cap is checked on what the provider
 *   receives, as the batch mode's `admit` checks its exact batch line
 *   (ASSUMPTION(oferty-pracy-0mq.21/ASM-5)).
 * - `ranBeforeSettings`: the provider ran the executions saved without
 *   provider settings, those migration 18 moved from Matching's former
 *   batch path (today OpenAI), so their archive is read through it
 *   (ASSUMPTION(oferty-pracy-0mq.21/ASM-8)).
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
    agent?: (settings: ProviderSettings) => AgentRunner
  }
  endOf: (observation: ProviderObservation) => ExecutionEnd
  sharedSlot?: boolean
  check?: (settings: ProviderSettings) => Promise<Record<string, unknown>>
  ready?: (settings: ProviderSettings) => boolean
  singleRequestBytes?: (
    settings: ProviderSettings,
    request: ModelRequest,
  ) => number
  ranBeforeSettings?: boolean
  reconstructBatchInput?: (bodies: SavedBatchBody[]) => string
}
