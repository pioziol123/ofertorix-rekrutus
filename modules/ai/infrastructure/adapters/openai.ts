import { ModelError } from '../../provider-adapter.ts'
import {
  BatchClient,
  openAiBatch,
  reconstructBatchInput,
} from './openai-batch.ts'
import { openAiAgent } from './openai-agent.ts'
import { record, tokenCount, validateRequest } from './response.ts'
import type {
  ModelRequest,
  ModelResult,
  ProviderAdapter,
  ProviderObservation,
  RequestContext,
  StructuredModel,
} from '../../provider-adapter.ts'
import type { ExecutionEnd } from '../../domain/execution-state.ts'

export function normalizeOpenAi(value: unknown): ModelResult {
  const result = record(value),
    usage = record(result.usage)
  const metadata = {
    usage: {
      inputTokens: tokenCount(usage.input_tokens),
      outputTokens: tokenCount(usage.output_tokens),
    },
    responseId: typeof result.id === 'string' ? result.id : null,
  }
  if (result.status !== 'completed')
    return { ...metadata, outcome: 'incomplete', text: null }
  const contents = (Array.isArray(result.output) ? result.output : [])
    .map(record)
    .filter(
      (v) =>
        v.type === 'message' &&
        (v.role === undefined || v.role === 'assistant'),
    )
    .flatMap((v) => (Array.isArray(v.content) ? v.content.map(record) : []))
  if (contents.some((v) => v.type === 'refusal'))
    return { ...metadata, outcome: 'refused', text: null }
  const texts = contents
    .filter((v) => v.type === 'output_text' && typeof v.text === 'string')
    .map((v) => v.text as string)
  if (texts.length !== 1 || !texts[0]!.trim())
    throw new ModelError('format', {
      ...metadata,
      requestSent: true,
      responseReceived: true,
      runtimeEnded: true,
    })
  return { ...metadata, outcome: 'completed', text: texts[0]! }
}

function retryDelay(value: string | null) {
  if (value === null) return 1000
  const ms =
    value.trim() && Number.isFinite(Number(value))
      ? Number(value) * 1000
      : Date.parse(value) - Date.now()
  return Number.isFinite(ms) && ms <= 60000 ? Math.max(1000, ms) : null
}
/**
 * The exact body of a single call to the Responses API, as sent. The
 * reasoning effort is `low` when not given and none when null.
 */
export function responsesBody(
  request: ModelRequest,
  options: { maxOutputTokens: number; reasoningEffort?: string | null },
): string {
  const effort =
    options.reasoningEffort === undefined ? 'low' : options.reasoningEffort
  return JSON.stringify({
    model: request.model,
    store: false,
    tools: [],
    service_tier: 'default',
    max_output_tokens: options.maxOutputTokens,
    ...(effort === null ? {} : { reasoning: { effort } }),
    instructions: request.instructions,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: request.input }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: request.output.name,
        strict: true,
        schema: request.output.schema,
      },
    },
  })
}

/** The diagnostic archive asked for could not keep an artefact. */
export class ArchiveError extends Error {
  constructor(
    readonly requestSent: boolean,
    options?: ErrorOptions,
  ) {
    super('AI archive', options)
  }
}

export class OpenAiAdapter implements StructuredModel {
  constructor(
    private fetcher: typeof fetch = fetch,
    private options: {
      maxOutputTokens: number
      url?: string
      apiKey?: () => string | undefined
      /** The reasoning effort sent; `low` when not given, none when null. */
      reasoningEffort?: string | null
      /** Keeps the exact request body and raw response, when given. */
      keepArtifact?: RequestContext['keepArtifact']
    } = { maxOutputTokens: 6000 },
  ) {}
  async generate(
    request: ModelRequest,
    signal?: AbortSignal,
  ): Promise<ModelResult> {
    validateRequest(request)
    const key = this.options.apiKey
      ? this.options.apiKey()
      : process.env.OPENAI_API_KEY
    if (!key) throw new ModelError('configuration')
    const body = responsesBody(request, this.options)
    // The exact body is archived before it is sent; a request whose
    // archive was asked for is not sent without it.
    await this.keep('input', 'request', body, false)
    let response: Response
    try {
      response = await this.fetcher(
        this.options.url ?? 'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
            : AbortSignal.timeout(90000),
        },
      )
    } catch (cause) {
      const aborted = signal?.aborted === true
      // The request may have been sent without a response: worth one more try.
      throw new ModelError(
        aborted ? 'aborted' : 'network',
        { requestSent: true, transient: !aborted },
        { cause },
      )
    }
    if (!response.ok) {
      const retryAfterMs = retryDelay(response.headers.get('retry-after'))
      throw new ModelError('http', {
        requestSent: true,
        responseReceived: true,
        httpStatus: response.status,
        retryAfterMs,
        // Rate limits and server errors pass, unless the wait is too long.
        transient:
          (response.status === 429 || response.status >= 500) &&
          retryAfterMs !== null,
      })
    }
    let raw: string
    try {
      raw = await response.text()
    } catch (cause) {
      throw new ModelError(
        'format',
        { requestSent: true, responseReceived: true },
        { cause },
      )
    }
    // The raw response is archived before it is interpreted.
    await this.keep('output', 'response', raw, true)
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch (cause) {
      throw new ModelError(
        'format',
        { requestSent: true, responseReceived: true },
        { cause },
      )
    }
    return normalizeOpenAi(value)
  }
  private async keep(
    kind: 'input' | 'output',
    key: string,
    content: string,
    requestSent: boolean,
  ) {
    if (!this.options.keepArtifact) return
    try {
      await this.options.keepArtifact(kind, key, content)
    } catch (cause) {
      throw new ArchiveError(requestSent, { cause })
    }
  }
}

/**
 * What an observation of the OpenAI adapter means publicly. A response
 * the model refused or did not complete, or that held no single content,
 * tells how the work ended. An error before the request was sent means it
 * did not start. Any other error leaves a response without usage: AI
 * cannot tell how the work ended or what it cost, so it is uncertain and
 * the reservation stays.
 */
export function openAiEnd(observation: ProviderObservation): ExecutionEnd {
  if (observation.kind === 'outcome')
    return { state: 'failed', cause: observation.outcome }
  if (observation.kind === 'lost_lease')
    return { state: 'uncertain', cause: 'interrupted' }
  const error = observation.error
  // A request whose archive was asked for is not sent without it; after
  // it was sent, a response that could not be archived is not read, so
  // how the work ended and what it cost stay unknown.
  if (error instanceof ArchiveError)
    return error.requestSent
      ? { state: 'uncertain', cause: 'unknown' }
      : { state: 'failed', cause: 'unknown' }
  if (!(error instanceof ModelError))
    return { state: 'uncertain', cause: 'unknown' }
  if (error.code === 'format' && error.details.runtimeEnded)
    return { state: 'failed', cause: 'no_content' }
  if (!error.details.requestSent) return { state: 'failed', cause: error.code }
  return { state: 'uncertain', cause: error.code }
}

/**
 * The OpenAI provider for the AI coordination, in single mode, as a
 * provider batch and as an agent with web search, on the default endpoints with the key from the
 * provider's secret.
 */
export function openAiProvider(
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): ProviderAdapter {
  return {
    provider: 'openai',
    modes: {
      single: (settings, context) =>
        new OpenAiAdapter(fetcher, {
          maxOutputTokens: settings.maxOutputTokens,
          reasoningEffort: settings.reasoningEffort,
          keepArtifact: context.keepArtifact,
        }),
      batch: (settings) =>
        openAiBatch(
          settings,
          () => new BatchClient(process.env.OPENAI_API_KEY ?? '', fetcher),
        ),
      agent: (settings) => openAiAgent(settings, fetcher),
    },
    // ASSUMPTION(oferty-pracy-0mq.21/ASM-5): the exact body single mode
    // sends, as the batch mode measures its exact batch line.
    singleRequestBytes: (settings, request) =>
      Buffer.byteLength(
        responsesBody(request, {
          maxOutputTokens: settings.maxOutputTokens,
          reasoningEffort: settings.reasoningEffort,
        }),
      ),
    // ASSUMPTION(oferty-pracy-0mq.21/ASM-8): Matching's former batch path
    // ran on OpenAI Batch; old batch inputs are framed by the batch mode
    // that frames every batch line.
    ranBeforeSettings: true,
    reconstructBatchInput,
    endOf: openAiEnd,
  }
}
