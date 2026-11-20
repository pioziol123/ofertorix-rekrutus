import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelError, type ModelRequest } from '../../provider-adapter.ts'
import { adapterOfExecution } from '../../provider-registry.ts'
import { OllamaAdapter, ollamaEnd } from './ollama.ts'
import {
  ArchiveError,
  OpenAiAdapter,
  normalizeOpenAi,
  openAiEnd,
  openAiProvider,
} from './openai.ts'

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
    expect(JSON.parse(result.text!)).toEqual(facts)
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
      expect(
        ollamaEnd({ kind: 'outcome', outcome: result.outcome as 'incomplete' }),
      ).toEqual({ state: 'failed', cause: 'incomplete' })
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
          transient: true,
        },
      })
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )
  it.each([
    ['a client error', 400, null],
    ['a server error with a too long wait', 503, '120'],
  ])('does not judge %s transient', async (_, status, retryAfter) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status,
        headers: retryAfter ? { 'Retry-After': retryAfter } : {},
      }),
    )
    await expect(
      new OpenAiAdapter(fetcher, {
        maxOutputTokens: 500,
        apiKey: () => 'synthetic',
      }).generate(request),
    ).rejects.toMatchObject({ code: 'http', details: { transient: false } })
  })
  it('does not judge a caller abort transient', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('aborted'))
    await expect(
      new OpenAiAdapter(fetcher, {
        maxOutputTokens: 500,
        apiKey: () => 'synthetic',
      }).generate(request, controller.signal),
    ).rejects.toMatchObject({ code: 'aborted', details: { transient: false } })
  })
  it('archives the exact body before sending and the raw response before reading it, when asked (SD 0mq.17 decision 5)', async () => {
    const events: string[] = []
    const raw = JSON.stringify({
      id: 'paid-id',
      status: 'completed',
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [message(JSON.stringify(facts))],
    })
    const fetcher = vi.fn<typeof fetch>(async () => {
      events.push('send')
      return new Response(raw)
    })
    const kept: [string, string, string][] = []
    await new OpenAiAdapter(fetcher, {
      maxOutputTokens: 500,
      apiKey: () => 'synthetic',
      keepArtifact: async (kind, key, content) => {
        events.push(kind)
        kept.push([kind, key, content])
      },
    }).generate(request)
    expect(events).toEqual(['input', 'send', 'output'])
    expect(kept).toEqual([
      ['input', 'request', String(fetcher.mock.calls[0]![1]!.body)],
      ['output', 'response', raw],
    ])
    // The archived body holds no credentials.
    expect(kept[0]![2]).not.toContain('synthetic')
  })
  it('does not send a request whose archive cannot be kept, and leaves an unarchived response unread', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"status":"completed"}'))
    const failing = (failOn: 'input' | 'output') =>
      new OpenAiAdapter(fetcher, {
        maxOutputTokens: 500,
        apiKey: () => 'synthetic',
        keepArtifact: async (kind) => {
          if (kind === failOn) throw new Error('database')
        },
      }).generate(request)
    const notSent = await failing('input').catch((e: unknown) => e)
    expect(notSent).toBeInstanceOf(ArchiveError)
    expect(fetcher).not.toHaveBeenCalled()
    expect(openAiEnd({ kind: 'error', error: notSent })).toEqual({
      state: 'failed',
      cause: 'unknown',
    })
    const unread = await failing('output').catch((e: unknown) => e)
    expect(unread).toBeInstanceOf(ArchiveError)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(openAiEnd({ kind: 'error', error: unread })).toEqual({
      state: 'uncertain',
      cause: 'unknown',
    })
  })
  it('measures the input cap on the exact body single mode sends (0mq.21 ASM-5)', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [message(JSON.stringify(facts))],
      }),
    )
    vi.stubEnv('OPENAI_API_KEY', 'synthetic')
    const provider = openAiProvider(fetcher)
    const settings = {
      provider: 'openai',
      model: 'paid-model',
      reasoningEffort: 'low',
      maxOutputTokens: 500,
      runtime: null,
    }
    await provider.modes.single!(settings, { fixed: {} }).generate({
      ...request,
      model: 'paid-model',
    })
    const sent = String(fetcher.mock.calls[0]![1]!.body)
    expect(
      provider.singleRequestBytes!(settings, {
        ...request,
        model: 'paid-model',
      }),
    ).toBe(Buffer.byteLength(sent))
    // More than the instruction, input and schema alone.
    expect(Buffer.byteLength(sent)).toBeGreaterThan(
      Buffer.byteLength(
        JSON.stringify({
          instructions: request.instructions,
          input: request.input,
          schema: request.output,
        }),
      ),
    )
    vi.unstubAllEnvs()
  })
  it('marks transport failure as possibly sent and never invents usage', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private'))
    await expect(
      new OpenAiAdapter(fetcher, {
        maxOutputTokens: 500,
        apiKey: () => 'synthetic',
      }).generate(request),
    ).rejects.toMatchObject({
      code: 'network',
      details: { requestSent: true, transient: true },
    })
    expect(
      normalizeOpenAi({
        status: 'incomplete',
        usage: { input_tokens: -1, output_tokens: 1.5 },
      }).usage,
    ).toEqual({ inputTokens: null, outputTokens: null })
  })
})

describe('A14-AC12: each adapter decides the public end of what it observed', () => {
  const sent = { requestSent: true, responseReceived: true }
  it.each([
    ['a refusal', { kind: 'outcome', outcome: 'refused' }, 'failed', 'refused'],
    [
      'an incomplete response',
      { kind: 'outcome', outcome: 'incomplete' },
      'failed',
      'incomplete',
    ],
    [
      'a completed response without content',
      { kind: 'outcome', outcome: 'no_content' },
      'failed',
      'no_content',
    ],
    [
      'no single content in a response',
      {
        kind: 'error',
        error: new ModelError('format', { ...sent, runtimeEnded: true }),
      },
      'failed',
      'no_content',
    ],
    [
      'an error before sending',
      { kind: 'error', error: new ModelError('configuration') },
      'failed',
      'configuration',
    ],
    [
      'an HTTP error response without usage',
      {
        kind: 'error',
        error: new ModelError('http', { ...sent, httpStatus: 401 }),
      },
      'uncertain',
      'http',
    ],
    [
      'a lost connection without usage',
      {
        kind: 'error',
        error: new ModelError('network', { requestSent: true }),
      },
      'uncertain',
      'network',
    ],
    [
      'an unreadable response without usage',
      { kind: 'error', error: new ModelError('format', sent) },
      'uncertain',
      'format',
    ],
    [
      'an unexpected error',
      { kind: 'error', error: new Error('bug') },
      'uncertain',
      'unknown',
    ],
  ] as const)('OpenAI: %s', (_, observation, state, cause) => {
    expect(openAiEnd(observation)).toEqual({ state, cause })
  })
  it.each([
    ['a refusal', { kind: 'outcome', outcome: 'refused' }, 'failed', 'refused'],
    [
      'a model missing before sending',
      { kind: 'error', error: new ModelError('model_unavailable') },
      'failed',
      'model_unavailable',
    ],
    [
      'a configuration error before sending',
      { kind: 'error', error: new ModelError('configuration') },
      'failed',
      'configuration',
    ],
    [
      'a confirmed end with no content',
      {
        kind: 'error',
        error: new ModelError('format', { ...sent, runtimeEnded: true }),
      },
      'failed',
      'no_content',
    ],
    [
      'a confirmed context overflow',
      {
        kind: 'error',
        error: new ModelError('context_overflow', {
          ...sent,
          runtimeEnded: true,
        }),
      },
      'failed',
      'context_overflow',
    ],
    [
      'a lost connection while the process runs',
      {
        kind: 'error',
        error: new ModelError('network', { requestSent: true }),
      },
      'uncertain',
      'network',
    ],
    [
      'a generic HTTP failure that does not prove the end',
      {
        kind: 'error',
        error: new ModelError('http', { ...sent, runtimeEnded: false }),
      },
      'uncertain',
      'http',
    ],
  ] as const)('Ollama: %s', (_, observation, state, cause) => {
    expect(ollamaEnd(observation)).toEqual({ state, cause })
  })
})

describe('the adapter of an execution saved without provider settings (0mq.21 ASM-8)', () => {
  it('is the OpenAI adapter, which ran the former batch path of Matching, and frames its old inputs', () => {
    const adapter = adapterOfExecution(undefined)
    expect(adapter?.provider).toBe('openai')
    expect(adapter?.reconstructBatchInput).toBeTypeOf('function')
    expect(adapterOfExecution('ollama')?.ranBeforeSettings).toBeFalsy()
  })
})
