import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAiAdapter, normalizeOpenAi } from '../lib/ai/models/openai.ts'
import { OllamaAdapter } from '../lib/ai/models/ollama.ts'
import type { ModelRequest } from '../lib/ai/models/model.ts'
import { readAiProposal } from '../lib/profile/ai-result.ts'

const facts = {
  summary: null,
  skills: [{ name: 'PHP', description: '', evidence: 'PHP' }],
  experience: [],
}
const request: ModelRequest = {
  model: 'gpt-oss:20b',
  instructions: 'Extract professional facts',
  input: 'PHP professional',
  output: {
    name: 'profile',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { summary: { type: 'null' } },
    },
  },
}
const tags = () =>
  Response.json({ models: [{ name: request.model, digest: 'sha256:test' }] })
const completion = (overrides = {}) => ({
  done: true,
  done_reason: 'stop',
  message: { role: 'assistant', content: JSON.stringify(facts) },
  prompt_eval_count: 12,
  eval_count: 8,
  ...overrides,
})
afterEach(() => vi.restoreAllMocks())

describe('Ollama native protocol and normalized results', () => {
  it('sends plain JSON Schema and preserves complete raw response before domain validation', async () => {
    const raw = JSON.stringify(completion()),
      archive = vi.fn(async (_raw: string) => {})
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tags())
      .mockResolvedValueOnce(new Response(raw))
    const adapter = new OllamaAdapter(fetcher, {
      url: 'http://local.test/',
      numCtx: 8192,
      modelDigest: 'sha256:test',
      archive,
    })
    const result = await adapter.generate(request)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'http://local.test/api/tags',
      'http://local.test/api/chat',
    ])
    const init = fetcher.mock.calls[1]![1]!
    expect(JSON.parse(String(init.body))).toEqual({
      model: request.model,
      stream: false,
      truncate: false,
      shift: false,
      messages: [
        { role: 'system', content: request.instructions },
        { role: 'user', content: request.input },
      ],
      format: request.output.schema,
      options: { num_ctx: 8192 },
    })
    expect(init.signal).toBeUndefined()
    expect(result).toEqual({
      outcome: 'completed',
      text: JSON.stringify(facts),
      usage: { inputTokens: 12, outputTokens: 8 },
      responseId: null,
    })
    expect(archive).toHaveBeenCalledExactlyOnceWith(raw)
    expect(readAiProposal(result, request.input)).toEqual(facts)
  })
  it.each(['length', 'load', undefined])(
    'does not accept completion reason %s',
    async (reason) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(tags())
        .mockResolvedValueOnce(
          Response.json(completion({ done_reason: reason })),
        )
      const result = await new OllamaAdapter(fetcher, {
        url: 'http://local.test',
        numCtx: 8192,
      }).generate(request)
      expect(result.outcome).toBe('incomplete')
      expect(result.text).toBeNull()
      expect(() => readAiProposal(result, request.input)).toThrow(
        'nie ukończyło',
      )
    },
  )
  it('archives malformed HTTP JSON without retrying or claiming confirmed termination', async () => {
    const archive = vi.fn(async (_raw: string) => {})
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tags())
      .mockResolvedValueOnce(new Response('{broken'))
    await expect(
      new OllamaAdapter(fetcher, {
        url: 'http://local.test',
        numCtx: 8192,
        archive,
      }).generate(request),
    ).rejects.toMatchObject({
      code: 'format',
      details: { requestSent: true, responseReceived: true },
    })
    expect(archive).toHaveBeenCalledExactlyOnceWith('{broken')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('rejects a changed digest before inference', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(tags())
    await expect(
      new OllamaAdapter(fetcher, {
        url: 'http://local.test',
        numCtx: 8192,
        modelDigest: 'old-digest',
      }).generate(request),
    ).rejects.toMatchObject({ code: 'model_unavailable', details: {} })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('passes the caller abort signal directly to inference without a fixed deadline', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const controller = new AbortController()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tags())
      .mockResolvedValueOnce(Response.json(completion()))
    await new OllamaAdapter(fetcher, {
      url: 'http://local.test',
      numCtx: 8192,
    }).generate(request, controller.signal)
    expect(timeout.mock.calls).toEqual([[10000]])
    expect(fetcher.mock.calls[1]![1]!.signal).toBe(controller.signal)
  })
})

describe('OpenAI adapter owns protocol and transport metadata', () => {
  const message = (text: string) => ({
    type: 'message',
    content: [{ type: 'output_text', text }],
  })
  it('wraps plain JSON Schema and retains usage for paid settlement', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'paid-id',
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [message(JSON.stringify(facts))],
      }),
    )
    const result = await new OpenAiAdapter(fetcher, {
      maxOutputTokens: 500,
      apiKey: () => 'synthetic',
    }).generate({ ...request, model: 'paid-model' })
    expect(result).toEqual({
      outcome: 'completed',
      text: JSON.stringify(facts),
      responseId: 'paid-id',
      usage: { inputTokens: 100, outputTokens: 50 },
    })
    expect(
      JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).text.format,
    ).toEqual({
      type: 'json_schema',
      name: request.output.name,
      strict: true,
      schema: request.output.schema,
    })
  })
  it('rejects multiple text outputs while preserving billable usage and response id', () => {
    expect(() =>
      normalizeOpenAi({
        id: 'paid-id',
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [message('PRIVATE'), message('PRIVATE')],
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'format',
        details: expect.objectContaining({
          responseId: 'paid-id',
          usage: { inputTokens: 100, outputTokens: 50 },
        }),
      }),
    )
  })
  it('normalizes refusals and incomplete output without exposing partial text', () => {
    expect(
      normalizeOpenAi({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', text: 'PRIVATE' }] },
        ],
      }),
    ).toMatchObject({ outcome: 'refused', text: null })
    expect(
      normalizeOpenAi({ status: 'incomplete', output: [message('PRIVATE')] }),
    ).toMatchObject({ outcome: 'incomplete', text: null })
  })
  it.each([429, 503])(
    'preserves HTTP %s and Retry-After for operation retry',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('private provider diagnostics', {
          status,
          headers: { 'Retry-After': '3' },
        }),
      )
      await expect(
        new OpenAiAdapter(fetcher, {
          maxOutputTokens: 500,
          apiKey: () => 'synthetic',
        }).generate(request),
      ).rejects.toMatchObject({
        code: 'http',
        message: 'AI http',
        details: {
          requestSent: true,
          responseReceived: true,
          httpStatus: status,
          retryAfterMs: 3000,
        },
      })
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )
  it('marks transport failure as possibly sent and never invents usage', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private'))
    await expect(
      new OpenAiAdapter(fetcher, {
        maxOutputTokens: 500,
        apiKey: () => 'synthetic',
      }).generate(request),
    ).rejects.toMatchObject({ code: 'network', details: { requestSent: true } })
    expect(
      normalizeOpenAi({
        status: 'incomplete',
        usage: { input_tokens: -1, output_tokens: 1.5 },
      }).usage,
    ).toEqual({ inputTokens: null, outputTokens: null })
  })
})
