import { ModelError } from '../../provider-adapter.ts'
import { record, tokenCount, validateRequest } from './response.ts'
import type {
  ModelRequest,
  ModelResult,
  ProviderAdapter,
  StructuredModel,
} from '../../provider-adapter.ts'

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
export class OpenAiAdapter implements StructuredModel {
  constructor(
    private fetcher: typeof fetch = fetch,
    private options: {
      maxOutputTokens: number
      url?: string
      apiKey?: () => string | undefined
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
          body: JSON.stringify({
            model: request.model,
            store: false,
            tools: [],
            service_tier: 'default',
            max_output_tokens: this.options.maxOutputTokens,
            reasoning: { effort: 'low' },
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
          }),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
            : AbortSignal.timeout(90000),
        },
      )
    } catch (cause) {
      throw new ModelError(
        signal?.aborted ? 'aborted' : 'network',
        { requestSent: true },
        { cause },
      )
    }
    if (!response.ok)
      throw new ModelError('http', {
        requestSent: true,
        responseReceived: true,
        httpStatus: response.status,
        retryAfterMs: retryDelay(response.headers.get('retry-after')),
      })
    let value: unknown
    try {
      value = await response.json()
    } catch (cause) {
      throw new ModelError(
        'format',
        { requestSent: true, responseReceived: true },
        { cause },
      )
    }
    return normalizeOpenAi(value)
  }
}

/** The OpenAI provider for the AI coordination, in single mode. */
export function openAiProvider(fetcher: typeof fetch = fetch): ProviderAdapter {
  return {
    provider: 'openai',
    single: (settings) =>
      new OpenAiAdapter(fetcher, {
        maxOutputTokens: settings.maxOutputTokens,
        ...(settings.endpoint
          ? {
              url: `${settings.endpoint.url.replace(/\/$/, '')}/responses`,
              apiKey: () =>
                settings.endpoint?.credentialEnv
                  ? process.env[settings.endpoint.credentialEnv]
                  : undefined,
            }
          : {}),
      }),
  }
}
