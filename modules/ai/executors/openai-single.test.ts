import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actualCost } from '../assignments/operation-cost.ts'
import { aiCatalog } from '../model-catalog.ts'
import type { ExecutorContent, OperationWork } from './declaration.ts'
import { openAiExecutor } from './openai.ts'

/**
 * The paid executor's single answer with a simulated OpenAI: the mapping
 * of events to outcomes of the solution design (T2-AC02), the maximum run
 * time (T2-AC03), the request of the old way (T2-AC04), no check against
 * the response format (T2-AC05) and the exchange written (T2-R08).
 */

const priceList = aiCatalog.models.find((m) => m.model === 'gpt-6-luna')!.prices
  .single!
const parameters = { model: 'gpt-6-luna', reasoningEffort: 'low' }
const content: ExecutorContent = {
  type: 'single',
  instruction: 'Assess the offer.',
  input: 'Ad text',
  responseFormat: {
    name: 'assessment',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { rating: { type: 'number' } },
      required: ['rating'],
    },
  },
  agent: null,
}

/** The work of one operation, keeping what the writers were given. */
function operation(
  overrides: Partial<OperationWork> = {},
  of: ExecutorContent = content,
) {
  const exchange: ['request' | 'response', string][] = []
  const work: OperationWork = {
    content: of,
    parameters,
    state: null,
    exchange: async (kind, raw) => {
      exchange.push([kind, raw])
      return true
    },
    saveState: async () => true,
    ...overrides,
  }
  return { work, exchange }
}

const answer = (overrides: Record<string, unknown> = {}) => ({
  id: 'resp-1',
  status: 'completed',
  usage: { input_tokens: 1200, output_tokens: 80 },
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: '{"rating":4}' }],
    },
  ],
  ...overrides,
})

const transportError = (code: string) =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error(code), { code }),
  })

const run = async (
  fetcher: typeof fetch,
  overrides: Partial<OperationWork> = {},
  of?: ExecutorContent,
) => {
  const { work, exchange } = operation(overrides, of)
  const outcome = await openAiExecutor(fetcher).carryOut(work)
  return { outcome, exchange, cost: actualCost(outcome.usage, priceList) }
}

beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'test-key'))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('T2-AC02: the paid single answer maps each event to its outcome, cause and usage', () => {
  it('a complete answer is a result with its usage and a computed cost', async () => {
    const { outcome, cost } = await run(
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(answer())),
    )
    expect(outcome).toEqual({
      kind: 'result',
      content: { rating: 4 },
      usage: { sent: true, inputTokens: 1200, outputTokens: 80, toolCalls: 0 },
    })
    expect(cost).toBe('0.000800')
  })

  it('a complete answer without usage is a result of unknown cost', async () => {
    const { outcome, cost } = await run(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(answer({ usage: undefined }))),
    )
    expect(outcome.kind).toBe('result')
    expect(cost).toBeNull()
  })

  it('a refusal is a non-retryable failure, costed from its usage', async () => {
    const { outcome, cost } = await run(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          answer({
            output: [
              {
                type: 'message',
                content: [{ type: 'refusal', refusal: 'No.' }],
              },
            ],
          }),
        ),
      ),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: false,
      cause: 'refused',
    })
    expect(cost).toBe('0.000800')
  })

  it('a missing secret is a non-retryable configuration failure with nothing sent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const fetcher = vi.fn<typeof fetch>()
    const { outcome, exchange, cost } = await run(fetcher)
    expect(outcome).toEqual({
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
      usage: { sent: false, inputTokens: 0, outputTokens: 0, toolCalls: 0 },
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(exchange).toEqual([])
    expect(cost).toBe('0.000000')
  })

  it.each([400, 401, 403, 404, 422])(
    'ASM-3: a client error %i is a request the provider cannot take at all: a non-retryable configuration failure of unknown cost',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ error: { code: 'invalid_request' } }, { status }),
        )
      const { outcome, cost } = await run(fetcher)
      expect(outcome).toEqual({
        kind: 'failed',
        retryable: false,
        cause: 'configuration',
        usage: {
          sent: true,
          inputTokens: null,
          outputTokens: null,
          toolCalls: null,
        },
      })
      expect(cost).toBeNull()
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )

  it.each([408, 409, 302])(
    'any other answer such as %i is uncertain of unknown cost, without a second call',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}', { status }))
      const { outcome, cost } = await run(fetcher)
      expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'unknown' })
      expect(cost).toBeNull()
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )

  it('an input beyond the model’s context is a non-retryable failure of unknown cost', async () => {
    const { outcome, cost } = await run(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'context_length_exceeded' } },
            { status: 400 },
          ),
        ),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: false,
      cause: 'context_overflow',
    })
    expect(cost).toBeNull()
  })

  it.each([
    [
      'an answer stopped before it was complete',
      answer({ status: 'incomplete' }),
      'incomplete',
    ],
    [
      'an answer with no single content',
      answer({
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: '{"rating":1}' },
              { type: 'output_text', text: '{"rating":2}' },
            ],
          },
        ],
      }),
      'no_content',
    ],
    [
      'content that cannot be read as JSON',
      answer({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'four' }] },
        ],
      }),
      'format',
    ],
  ] as const)(
    '%s is an ordinary failure costed from its usage',
    async (_, body, cause) => {
      const { outcome, cost } = await run(
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
      )
      expect(outcome).toMatchObject({ kind: 'failed', retryable: true, cause })
      expect(cost).toBe('0.000800')
    },
  )

  it('a response that cannot be read is an ordinary failure of unknown cost', async () => {
    const { outcome, cost } = await run(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>')),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'format',
    })
    expect(cost).toBeNull()
  })

  it('a connection error before the request left is an ordinary failure with nothing sent', async () => {
    const { outcome, cost } = await run(
      vi.fn<typeof fetch>().mockRejectedValue(transportError('ECONNREFUSED')),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'network',
      usage: { sent: false },
    })
    expect(cost).toBe('0.000000')
  })

  it('a rate limit is an ordinary failure charged nothing, without a wait or a second call', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{}', { status: 429, headers: { 'retry-after': '1' } }),
      )
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'http',
    })
    expect(cost).toBe('0.000000')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('a server error is an ordinary failure of unknown cost, without a second call', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 503 }))
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'http',
    })
    expect(cost).toBeNull()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('a broken connection after the request was sent is uncertain, without a second call', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(transportError('ECONNRESET'))
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'network' })
    expect(cost).toBeNull()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('the request’s own limit of 90 seconds is an ordinary failure of unknown cost', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>(
      (_, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    )
    const pending = run(fetcher)
    await vi.advanceTimersByTimeAsync(89_999)
    await vi.advanceTimersByTimeAsync(1)
    const { outcome, cost } = await pending
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'time_limit_run',
    })
    expect(cost).toBeNull()
  })

  it('any other error is uncertain with the cause unknown', async () => {
    const { outcome } = await run(
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(answer())),
      {
        exchange: async (kind) => {
          if (kind === 'response') throw new Error('database unavailable')
          return true
        },
      },
    )
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'unknown' })
  })
})

describe('T2-AC03: the paid single answer ends its own work at its maximum run time', () => {
  it('a provider that never answers and ignores the abort ends as an ordinary failure after 2 minutes', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}))
    let ended = false
    const pending = run(fetcher).then((result) => {
      ended = true
      return result
    })
    await vi.advanceTimersByTimeAsync(119_999)
    expect(ended).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const { outcome } = await pending
    expect(outcome).toEqual({
      kind: 'failed',
      retryable: true,
      cause: 'time_limit_run',
      usage: {
        sent: true,
        inputTokens: null,
        outputTokens: null,
        toolCalls: null,
      },
    })
  })
})

describe('T2-AC04: the paid single answer sends the request of the old way', () => {
  // The request the old adapter sent, pinned when the old way was removed
  // (task oferty-pracy-sq2.11), while the comparison with it still passed.
  it('sends the same body, to the same endpoint, with the same headers, as the old adapter', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(answer()))
    const { outcome } = await run(fetcher)
    const [now] = fetcher.mock.calls
    expect({
      url: now![0],
      method: now![1]!.method,
      headers: now![1]!.headers,
      body: now![1]!.body,
    }).toMatchInlineSnapshot(`
      {
        "body": "{"model":"gpt-6-luna","store":false,"tools":[],"service_tier":"default","max_output_tokens":6000,"reasoning":{"effort":"low"},"instructions":"Assess the offer.","input":[{"role":"user","content":[{"type":"input_text","text":"Ad text"}]}],"text":{"format":{"type":"json_schema","name":"assessment","strict":true,"schema":{"type":"object","additionalProperties":false,"properties":{"rating":{"type":"number"}},"required":["rating"]}}}}",
        "headers": {
          "Authorization": "Bearer test-key",
          "Content-Type": "application/json",
        },
        "method": "POST",
        "url": "https://api.openai.com/v1/responses",
      }
    `)
    expect(outcome.kind).toBe('result')
  })
})

describe('T2-AC05: the result is not compared with the response format', () => {
  it('returns a result that does not follow the response format as a result', async () => {
    const { outcome } = await run(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          answer({
            output: [
              {
                type: 'message',
                content: [
                  { type: 'output_text', text: '{"verdict":"strong"}' },
                ],
              },
            ],
          }),
        ),
      ),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      content: { verdict: 'strong' },
    })
  })
})

describe('T2-R08: the exchange of the paid single answer', () => {
  it('writes the exact request before sending it and the raw response before reading it', async () => {
    const raw = JSON.stringify(answer())
    const order: string[] = []
    const fetcher = vi.fn<typeof fetch>(async () => {
      order.push('sent')
      return new Response(raw)
    })
    const exchange: ['request' | 'response', string][] = []
    await run(fetcher, {
      exchange: async (kind, text) => {
        order.push(kind)
        exchange.push([kind, text])
        return true
      },
    })
    expect(order).toEqual(['request', 'sent', 'response'])
    expect(exchange).toEqual([
      ['request', String(fetcher.mock.calls[0]![1]!.body)],
      ['response', raw],
    ])
    expect(exchange[0]![1]).not.toContain('test-key')
  })

  it('sends nothing when the operation no longer runs', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await run(fetcher, { exchange: async () => false })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('ASM-1: without a response format it asks for no format and returns the text', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        answer({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Plain words' }],
            },
          ],
        }),
      ),
    )
    const { outcome } = await run(
      fetcher,
      {},
      { ...content, responseFormat: null },
    )
    expect(
      JSON.parse(String(fetcher.mock.calls[0]![1]!.body)),
    ).not.toHaveProperty('text')
    expect(outcome).toMatchObject({ kind: 'result', content: 'Plain words' })
  })
})
