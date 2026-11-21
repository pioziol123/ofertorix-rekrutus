import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actualCost } from '../assignments/operation-cost.ts'
import { OllamaAdapter } from '../infrastructure/adapters/ollama.ts'
import type { ExecutorContent, OperationWork } from './declaration.ts'
import { ollamaExecutor } from './ollama.ts'

/**
 * The local executor's single answer with a simulated local runtime: the
 * mapping of events to outcomes (T2-AC02), the maximum run time
 * (T2-AC03), the requests of the old way (T2-AC04), no check against the
 * response format (T2-AC05) and the exchange written (T2-R08).
 */

const endpoint = {
  ref: 'ollama',
  version: 1,
  url: 'http://local.test/',
  credentialEnv: 'LOCAL_AI_TOKEN',
}
const parameters = { model: 'gpt-oss:20b' }
const content: ExecutorContent = {
  type: 'single',
  instruction: 'Extract professional facts',
  input: 'PHP professional',
  responseFormat: {
    name: 'profile',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
  agent: null,
}

const tags = () =>
  Response.json({ models: [{ name: 'gpt-oss:20b', digest: 'sha256:test' }] })
const completion = (overrides: Record<string, unknown> = {}) => ({
  done: true,
  done_reason: 'stop',
  message: { role: 'assistant', content: '{"summary":"PHP"}' },
  prompt_eval_count: 12,
  eval_count: 8,
  ...overrides,
})

const answers = (...bodies: (Response | Error)[]) => {
  const fetcher = vi.fn<typeof fetch>()
  for (const body of bodies)
    if (body instanceof Error) fetcher.mockRejectedValueOnce(body)
    else fetcher.mockResolvedValueOnce(body)
  return fetcher
}

const connectionError = (code: string) =>
  Object.assign(new Error(code), { code })

async function run(
  fetcher: typeof fetch,
  overrides: Partial<OperationWork> = {},
) {
  const exchange: ['request' | 'response', string][] = []
  const outcome = await ollamaExecutor(fetcher).carryOut({
    content,
    parameters,
    state: null,
    exchange: async (kind, raw) => {
      exchange.push([kind, raw])
      return true
    },
    saveState: async () => true,
    ...overrides,
  })
  return { outcome, exchange, cost: actualCost(outcome.usage, null) }
}

beforeEach(() => {
  vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
  vi.stubEnv('LOCAL_AI_TOKEN', 'local-secret')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('T2-AC04: the local single answer sends the requests of the old way', () => {
  it('asks for the models, then sends the same chat request as the old adapter, and returns the result at no cost', async () => {
    const now = answers(tags(), Response.json(completion()))
    const before = answers(tags(), Response.json(completion()))
    const { outcome, cost } = await run(now)
    await new OllamaAdapter(before, {
      url: endpoint.url,
      numCtx: 32768,
      credential: () => 'local-secret',
    }).generate({
      model: 'gpt-oss:20b',
      instructions: content.instruction,
      input: content.input,
      output: content.responseFormat!,
    })
    expect(now.mock.calls.map((call) => call[0])).toEqual(
      before.mock.calls.map((call) => call[0]),
    )
    for (const [index, call] of now.mock.calls.entries()) {
      const old = before.mock.calls[index]!
      expect(call[1]!.method).toBe(old[1]!.method)
      expect(call[1]!.headers).toEqual(old[1]!.headers)
      expect(call[1]!.body).toBe(old[1]!.body)
    }
    expect(outcome).toEqual({
      kind: 'result',
      content: { summary: 'PHP' },
      usage: { sent: true, inputTokens: 12, outputTokens: 8, toolCalls: 0 },
    })
    expect(cost).toBe('0.000000')
  })
})

describe('T2-AC02: the local single answer maps each event to its outcome, cause and usage', () => {
  it('a missing address is a non-retryable configuration failure with nothing sent', async () => {
    vi.stubEnv('AI_ENDPOINTS_JSON', '[]')
    const fetcher = vi.fn<typeof fetch>()
    const { outcome } = await run(fetcher)
    expect(outcome).toEqual({
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
      usage: { sent: false, inputTokens: 0, outputTokens: 0, toolCalls: 0 },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('a runtime that cannot be reached is an ordinary failure with nothing sent', async () => {
    const { outcome } = await run(answers(connectionError('ECONNREFUSED')))
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'network',
      usage: { sent: false },
    })
  })

  it('a model the runtime does not list is an ordinary failure before the chat', async () => {
    const fetcher = answers(Response.json({ models: [] }))
    const { outcome } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'model_unavailable',
      usage: { sent: false },
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('a model the chat does not find is an ordinary failure', async () => {
    const { outcome } = await run(
      answers(tags(), Response.json({ error: 'not found' }, { status: 404 })),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'model_unavailable',
    })
  })

  it('an input beyond the model’s context is a non-retryable failure', async () => {
    const { outcome } = await run(
      answers(
        tags(),
        Response.json({ code: 'context_overflow' }, { status: 400 }),
      ),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: false,
      cause: 'context_overflow',
    })
  })

  it.each([400, 401, 403, 422])(
    'ASM-3: a client error %i of the chat is a non-retryable configuration failure, as for the paid executor',
    async (status) => {
      const fetcher = answers(
        tags(),
        Response.json({ error: 'rejected' }, { status }),
      )
      const { outcome } = await run(fetcher)
      expect(outcome).toMatchObject({
        kind: 'failed',
        retryable: false,
        cause: 'configuration',
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

  it('ASM-3: a client error of the list of models is a non-retryable configuration failure before the chat', async () => {
    const fetcher = answers(new Response('Unauthorized', { status: 401 }))
    const { outcome } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
      usage: { sent: false },
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([408, 409])(
    'ASM-3: an answer %i of the chat is uncertain',
    async (status) => {
      const { outcome } = await run(
        answers(tags(), new Response('{}', { status })),
      )
      expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'unknown' })
    },
  )

  it('a server error is an ordinary failure, without a second call', async () => {
    const fetcher = answers(
      tags(),
      new Response('Bad gateway', { status: 502 }),
    )
    const { outcome } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'http',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      'an answer stopped before it was complete',
      completion({ done_reason: 'length' }),
      'incomplete',
    ],
    [
      'an answer without content',
      completion({ message: { role: 'assistant', content: ' ' } }),
      'no_content',
    ],
    [
      'an answer the runtime did not finish',
      completion({ done: false }),
      'format',
    ],
    [
      'content that cannot be read as JSON',
      completion({ message: { role: 'assistant', content: 'PHP' } }),
      'format',
    ],
  ] as const)(
    '%s is an ordinary failure with its usage',
    async (_, body, cause) => {
      const { outcome } = await run(answers(tags(), Response.json(body)))
      expect(outcome).toMatchObject({
        kind: 'failed',
        retryable: true,
        cause,
        usage: { sent: true, inputTokens: 12, outputTokens: 8 },
      })
    },
  )

  it('a response that cannot be read is an ordinary failure', async () => {
    const { outcome } = await run(answers(tags(), new Response('<html>')))
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'format',
    })
  })

  it('a broken connection after the chat was sent is uncertain', async () => {
    const { outcome } = await run(
      answers(tags(), connectionError('ECONNRESET')),
    )
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'network' })
  })

  it('a connection error before the chat left is an ordinary failure with nothing sent', async () => {
    const { outcome } = await run(
      answers(tags(), connectionError('ECONNREFUSED')),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'network',
      usage: { sent: false },
    })
  })

  it('any other error is uncertain with the cause unknown', async () => {
    const { outcome } = await run(
      answers(tags(), Response.json(completion())),
      {
        exchange: async () => {
          throw new Error('database unavailable')
        },
      },
    )
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'unknown' })
  })
})

describe('T2-AC03: the local single answer ends its own work at its maximum run time', () => {
  it('a runtime that never answers the chat ends as an ordinary failure after 30 minutes', async () => {
    vi.useFakeTimers()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tags())
      .mockImplementationOnce(
        (_, init) =>
          new Promise((_, reject) =>
            init!.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          ),
      )
    let ended = false
    const pending = run(fetcher).then((result) => {
      ended = true
      return result
    })
    await vi.advanceTimersByTimeAsync(1_799_999)
    expect(ended).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const { outcome } = await pending
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'time_limit_run',
    })
  })
})

describe('T2-AC05 and T2-R08 for the local single answer', () => {
  it('returns a result that does not follow the response format as a result', async () => {
    const { outcome } = await run(
      answers(
        tags(),
        Response.json(
          completion({
            message: { role: 'assistant', content: '{"skills":["PHP"]}' },
          }),
        ),
      ),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      content: { skills: ['PHP'] },
    })
  })

  it('writes each request before sending it and each raw response before reading it, the list of models as its method and address (ASM-2)', async () => {
    const raws = [
      JSON.stringify({ models: [{ name: 'gpt-oss:20b' }] }),
      JSON.stringify(completion()),
    ]
    const order: string[] = []
    let sent = 0
    const fetcher = vi.fn<typeof fetch>(async () => {
      order.push('sent')
      return new Response(raws[sent++])
    })
    const exchange: ['request' | 'response', string][] = []
    await run(fetcher, {
      exchange: async (kind, raw) => {
        order.push(kind)
        exchange.push([kind, raw])
        return true
      },
    })
    expect(order).toEqual([
      'request',
      'sent',
      'response',
      'request',
      'sent',
      'response',
    ])
    expect(exchange).toEqual([
      ['request', 'GET http://local.test/api/tags'],
      ['response', raws[0]],
      ['request', String(fetcher.mock.calls[1]![1]!.body)],
      ['response', raws[1]],
    ])
    expect(JSON.stringify(exchange)).not.toContain('local-secret')
  })

  it('ASM-1: without a response format it asks for no format and returns the text', async () => {
    const fetcher = answers(
      tags(),
      Response.json(
        completion({ message: { role: 'assistant', content: 'Plain words' } }),
      ),
    )
    const exchange: ['request' | 'response', string][] = []
    const outcome = await ollamaExecutor(fetcher).carryOut({
      content: { ...content, responseFormat: null },
      parameters,
      state: null,
      exchange: async (kind, raw) => {
        exchange.push([kind, raw])
        return true
      },
      saveState: async () => true,
    })
    expect(
      JSON.parse(String(fetcher.mock.calls[1]![1]!.body)),
    ).not.toHaveProperty('format')
    expect(outcome).toMatchObject({ kind: 'result', content: 'Plain words' })
  })
})
