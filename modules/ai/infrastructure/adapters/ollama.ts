import { ModelError } from '../../provider-adapter.ts'
import { record, tokenCount, validateRequest } from './response.ts'
import type {
  ModelRequest,
  ModelResult,
  StructuredModel,
} from '../../provider-adapter.ts'
import { localFetch } from './local-http.ts'

export type OllamaOptions = {
  url: string
  numCtx: number
  credential?: () => string | undefined
  modelDigest?: string | null
  archive?: (raw: string) => Promise<void>
  beforeGenerate?: () => Promise<void>
}
export class OllamaAdapter implements StructuredModel {
  constructor(
    private fetcher: typeof fetch = localFetch,
    private options: OllamaOptions,
  ) {}
  private headers() {
    const token = this.options.credential?.()
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }
  async checkModelAvailability(model: string): Promise<string | null> {
    let response: Response
    try {
      response = await this.fetcher(
        `${this.options.url.replace(/\/$/, '')}/api/tags`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(10000),
        },
      )
    } catch (cause) {
      throw new ModelError('network', {}, { cause })
    }
    if (!response.ok)
      throw new ModelError('http', { httpStatus: response.status })
    let result: Record<string, unknown>
    try {
      result = record(await response.json())
    } catch (cause) {
      throw new ModelError('format', {}, { cause })
    }
    if (!Array.isArray(result.models)) throw new ModelError('format')
    const entry = result.models.map(record).find((m) => m.name === model)
    if (!entry) throw new ModelError('model_unavailable')
    const digest =
      typeof entry.digest === 'string' && entry.digest ? entry.digest : null
    if (this.options.modelDigest && digest !== this.options.modelDigest)
      throw new ModelError('model_unavailable')
    return digest
  }
  async generate(
    request: ModelRequest,
    signal?: AbortSignal,
  ): Promise<ModelResult> {
    validateRequest(request)
    await this.checkModelAvailability(request.model)
    await this.options.beforeGenerate?.()
    let response: Response
    try {
      response = await this.fetcher(
        `${this.options.url.replace(/\/$/, '')}/api/chat`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model: request.model,
            stream: false,
            truncate: false,
            shift: false,
            messages: [
              { role: 'system', content: request.instructions },
              { role: 'user', content: request.input },
            ],
            format: request.output.schema,
            options: { num_ctx: this.options.numCtx },
          }),
          signal,
        },
      )
    } catch (cause) {
      throw new ModelError(
        signal?.aborted ? 'aborted' : 'network',
        { requestSent: true },
        { cause },
      )
    }
    let raw: string
    try {
      raw = await response.text()
    } catch (cause) {
      throw new ModelError(
        'network',
        { requestSent: true, responseReceived: true },
        { cause },
      )
    }
    // A failed archive is not a successful request; keep the slot conservative.
    await this.options.archive?.(raw)
    let value: Record<string, unknown>
    try {
      value = record(JSON.parse(raw))
    } catch (cause) {
      throw new ModelError(
        'format',
        { requestSent: true, responseReceived: true },
        { cause },
      )
    }
    if (!response.ok) {
      // A proxy timeout or a generic HTTP failure does not prove the model stopped.
      const code =
        response.status === 404
          ? 'model_unavailable'
          : response.status === 400 && value.code === 'context_overflow'
            ? 'context_overflow'
            : 'http'
      throw new ModelError(code, {
        requestSent: true,
        responseReceived: true,
        httpStatus: response.status,
        runtimeEnded:
          code === 'model_unavailable' || code === 'context_overflow',
      })
    }
    const message = record(value.message)
    const usage = {
      inputTokens: tokenCount(value.prompt_eval_count),
      outputTokens: tokenCount(value.eval_count),
    }
    const details = {
      requestSent: true,
      responseReceived: true,
      runtimeEnded: value.done === true,
      usage,
    }
    if (value.done !== true) throw new ModelError('format', details)
    if (value.done_reason !== 'stop')
      return { outcome: 'incomplete', text: null, usage, responseId: null }
    if (
      message.role !== 'assistant' ||
      typeof message.content !== 'string' ||
      !message.content.trim()
    )
      throw new ModelError('format', details)
    return {
      outcome: 'completed',
      text: message.content,
      usage,
      responseId: null,
    }
  }
}
