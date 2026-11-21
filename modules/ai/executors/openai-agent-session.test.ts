import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actualCost } from '../assignments/operation-cost.ts'
import {
  citedMaterials,
  openAiAgent,
} from '../infrastructure/adapters/openai-agent.ts'
import { aiCatalog } from '../model-catalog.ts'
import type { ExecutorContent, OperationWork } from './declaration.ts'
import { openAiExecutor, sessionFits } from './openai.ts'

/**
 * The paid executor's agent session with a simulated OpenAI: the mapping
 * of events to outcomes (T2-AC02), the maximum run time (T2-AC03), the
 * requests and materials of the old way (T2-AC04) and the exchange
 * written (T2-R08).
 */

const priceList = aiCatalog.models.find((m) => m.model === 'gpt-6-luna')!.prices
  .agent!
const parameters = { model: 'gpt-6-luna', reasoningEffort: 'low' }
const content: ExecutorContent = {
  type: 'agent',
  instruction: 'Gather facts about the company.',
  input: JSON.stringify({ name: 'Example', kind: 'brand' }),
  responseFormat: {
    name: 'report',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
  agent: {
    tools: ['web_search'],
    resultInstruction: 'Write the report from the evidence.',
  },
}

const search = (overrides: Record<string, unknown> = {}) => ({
  id: 'search-id',
  status: 'completed',
  usage: { input_tokens: 1000, output_tokens: 50 },
  output: [
    {
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'search' },
    },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'Project uses PHP.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://company.example/project',
              title: 'Project',
              start_index: 0,
              end_index: 17,
            },
          ],
        },
      ],
    },
  ],
  ...overrides,
})
const synthesis = (overrides: Record<string, unknown> = {}) => ({
  id: 'synthesis-id',
  status: 'completed',
  usage: { input_tokens: 2000, output_tokens: 70 },
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: '{"summary":"PHP"}' }],
    },
  ],
  ...overrides,
})

const answers = (...bodies: (Response | Error)[]) => {
  const fetcher = vi.fn<typeof fetch>()
  for (const body of bodies)
    if (body instanceof Error) fetcher.mockRejectedValueOnce(body)
    else fetcher.mockResolvedValueOnce(body)
  return fetcher
}

const transportError = (code: string) =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error(code), { code }),
  })

async function run(
  fetcher: typeof fetch,
  overrides: Partial<OperationWork> = {},
) {
  const exchange: ['request' | 'response', string][] = []
  const states: unknown[] = []
  const executor = openAiExecutor(fetcher)
  const outcome = await executor.carryOut({
    content,
    parameters,
    state: null,
    exchange: async (kind, raw) => {
      exchange.push([kind, raw])
      return true
    },
    saveState: async (state) => {
      states.push(structuredClone(state))
      return true
    },
    ...overrides,
  })
  return {
    outcome,
    exchange,
    states,
    executor,
    cost: actualCost(outcome.usage, priceList),
  }
}

beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'test-key'))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('T2-AC04: the paid agent session sends the requests of the old way and returns its result and materials', () => {
  it('sends the same search and synthesis as the old agent, and keeps the same materials', async () => {
    const now = answers(Response.json(search()), Response.json(synthesis()))
    const before = answers(Response.json(search()), Response.json(synthesis()))
    const { outcome, states, executor, cost } = await run(now)
    const oldAgent = openAiAgent(
      {
        provider: 'openai',
        model: 'gpt-6-luna',
        reasoningEffort: 'low',
        maxInputTokens: priceList.maxInputTokens,
        maxOutputTokens: priceList.maxOutputTokens,
        maxToolCalls: priceList.maxToolCalls!,
        runtime: null,
      },
      before,
      () => 'test-key',
    )
    const oldStates: unknown[] = []
    await oldAgent.run(
      {
        model: 'gpt-6-luna',
        instructions: content.instruction,
        resultInstructions: content.agent!.resultInstruction,
        input: content.input,
        output: content.responseFormat!,
        tools: ['web_search'],
      },
      { save: async (state) => void oldStates.push(structuredClone(state)) },
    )
    expect(now.mock.calls).toHaveLength(2)
    for (const [index, call] of now.mock.calls.entries()) {
      const old = before.mock.calls[index]!
      expect(call[0]).toBe(old[0])
      expect(call[1]!.method).toBe(old[1]!.method)
      expect(call[1]!.headers).toEqual(old[1]!.headers)
      const body = JSON.parse(String(call[1]!.body))
      const oldBody = JSON.parse(String(old[1]!.body))
      // The materials carry the moment they were read.
      if (index === 1) {
        const input = JSON.parse(body.input)
        const oldInput = JSON.parse(oldBody.input)
        for (const unit of [...input.evidence, ...oldInput.evidence])
          for (const source of unit.sources) source.accessedAt = 'at'
        body.input = input
        oldBody.input = oldInput
      }
      expect(body).toEqual(oldBody)
    }
    expect(outcome).toEqual({
      kind: 'result',
      content: { summary: 'PHP' },
      usage: { sent: true, inputTokens: 3000, outputTokens: 120, toolCalls: 1 },
    })
    expect(cost).not.toBeNull()
    const materials = executor.materials(states.at(-1))
    expect(materials).toEqual(
      citedMaterials(search(), materials![0]!.sources[0]!.accessedAt),
    )
    expect(materials).toEqual(
      oldAgent.materials(oldStates.at(-1)).map((unit) => ({
        ...unit,
        sources: unit.sources.map((source) => ({
          ...source,
          accessedAt: materials![0]!.sources[0]!.accessedAt,
        })),
      })),
    )
  })

  it('writes each request before sending it and each raw response before reading it, and the step log before each step', async () => {
    const raws = [JSON.stringify(search()), JSON.stringify(synthesis())]
    const order: string[] = []
    const fetcher = vi.fn<typeof fetch>(async () => {
      order.push('sent')
      return new Response(raws[order.filter((o) => o === 'sent').length - 1])
    })
    const exchange: ['request' | 'response', string][] = []
    const { states } = await run(fetcher, {
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
    expect(exchange.map(([kind, raw]) => [kind, raw])).toEqual([
      ['request', String(fetcher.mock.calls[0]![1]!.body)],
      ['response', raws[0]],
      ['request', String(fetcher.mock.calls[1]![1]!.body)],
      ['response', raws[1]],
    ])
    expect(
      states.map((state) =>
        (state as { steps: { step: string; status: string }[] }).steps.map(
          (s) => `${s.step}:${s.status}`,
        ),
      )[0],
    ).toEqual(['search:sent'])
  })

  it('sends nothing more once a writer says the operation no longer runs', async () => {
    const fetcher = answers(Response.json(search()))
    let writes = 0
    await run(fetcher, {
      saveState: async () => ++writes < 3,
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })
})

describe('the models of an agent session', () => {
  it('does not take gpt-4.1-mini, whose fixed block of tokens per search it does not count', () => {
    const caps = { ...priceList, maxInputTokens: 500000, maxOutputTokens: 6000 }
    expect(sessionFits(parameters, caps)).toBe(true)
    expect(
      sessionFits({ model: 'gpt-4.1-mini', reasoningEffort: null }, caps),
    ).toBe(false)
  })
})

describe('ASM-1: an agent session without a response format', () => {
  it('asks the synthesis for no format and returns its text', async () => {
    const fetcher = answers(
      Response.json(search()),
      Response.json(
        synthesis({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Plain report' }],
            },
          ],
        }),
      ),
    )
    const outcome = await openAiExecutor(fetcher).carryOut({
      content: { ...content, responseFormat: null },
      parameters,
      state: null,
      exchange: async () => true,
      saveState: async () => true,
    })
    expect(
      JSON.parse(String(fetcher.mock.calls[1]![1]!.body)),
    ).not.toHaveProperty('text')
    expect(outcome).toMatchObject({ kind: 'result', content: 'Plain report' })
  })
})

describe('T2-AC02: the paid agent session maps each event to its outcome, cause and usage', () => {
  it('a missing secret is a non-retryable configuration failure with nothing sent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const fetcher = vi.fn<typeof fetch>()
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(cost).toBe('0.000000')
  })

  it('a refusal is a non-retryable failure costed from its usage', async () => {
    const { outcome, cost } = await run(
      answers(
        Response.json(search()),
        Response.json(
          synthesis({
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
    expect(cost).not.toBeNull()
  })

  it('an input beyond the model’s context is a non-retryable failure', async () => {
    const { outcome } = await run(
      answers(
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
  })

  it('a search without cited material ends as an ordinary failure without a synthesis, costed from the search', async () => {
    const fetcher = answers(
      Response.json(
        search({
          output: [
            {
              type: 'web_search_call',
              status: 'completed',
              action: { type: 'search' },
            },
          ],
        }),
      ),
    )
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'no_content',
      usage: { inputTokens: 1000, outputTokens: 50, toolCalls: 1 },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(cost).not.toBeNull()
  })

  it.each([
    [
      'an answer stopped before it was complete',
      synthesis({ status: 'incomplete' }),
      'incomplete',
    ],
    [
      'an answer with no single content',
      synthesis({
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: '{"summary":"a"}' },
              { type: 'output_text', text: '{"summary":"b"}' },
            ],
          },
        ],
      }),
      'no_content',
    ],
    [
      'content that cannot be read as JSON',
      synthesis({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'PHP' }] },
        ],
      }),
      'format',
    ],
  ] as const)(
    '%s is an ordinary failure costed from its usage',
    async (_, body, cause) => {
      const { outcome, cost } = await run(
        answers(Response.json(search()), Response.json(body)),
      )
      expect(outcome).toMatchObject({ kind: 'failed', retryable: true, cause })
      expect(cost).not.toBeNull()
    },
  )

  it('a response that cannot be read is an ordinary failure of unknown cost', async () => {
    const { outcome, cost } = await run(
      answers(Response.json(search()), new Response('<html>')),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'format',
    })
    expect(cost).toBeNull()
  })

  it('a connection error before the first request left is an ordinary failure with nothing sent', async () => {
    const { outcome, cost } = await run(answers(transportError('ENOTFOUND')))
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'network',
      usage: { sent: false },
    })
    expect(cost).toBe('0.000000')
  })

  it('a rate limit of the synthesis is an ordinary failure, costed from the search alone, without a second call', async () => {
    const fetcher = answers(
      Response.json(search()),
      new Response('{}', { status: 429 }),
    )
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'http',
      usage: { inputTokens: 1000, outputTokens: 50, toolCalls: 1 },
    })
    expect(cost).not.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([400, 401, 403, 404, 422])(
    'ASM-3: a client error %i of the synthesis is a non-retryable configuration failure of unknown cost',
    async (status) => {
      const fetcher = answers(
        Response.json(search()),
        Response.json({ error: { code: 'invalid_request' } }, { status }),
      )
      const { outcome, cost, states } = await run(fetcher)
      expect(outcome).toMatchObject({
        kind: 'failed',
        retryable: false,
        cause: 'configuration',
        usage: { sent: true, inputTokens: null },
      })
      expect(cost).toBeNull()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(
        (states.at(-1) as { steps: { status: string }[] }).steps.at(-1)!.status,
      ).toBe('failed')
    },
  )

  it.each([408, 409])(
    'an answer %i of a step is uncertain of unknown cost, without a second call',
    async (status) => {
      const fetcher = answers(new Response('{}', { status }))
      const { outcome, cost, states } = await run(fetcher)
      expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'unknown' })
      expect(cost).toBeNull()
      expect(fetcher).toHaveBeenCalledOnce()
      expect(
        (states.at(-1) as { steps: { status: string }[] }).steps.at(-1)!.status,
      ).toBe('unknown')
    },
  )

  it('a server error is an ordinary failure of unknown cost', async () => {
    const { outcome, cost } = await run(
      answers(Response.json(search()), new Response('{}', { status: 500 })),
    )
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'http',
    })
    expect(cost).toBeNull()
  })

  it('a broken connection after a step was sent is uncertain of unknown cost', async () => {
    const { outcome, cost, states } = await run(
      answers(Response.json(search()), transportError('ECONNRESET')),
    )
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'network' })
    expect(cost).toBeNull()
    expect(
      (states.at(-1) as { steps: { status: string }[] }).steps.at(-1)!.status,
    ).toBe('unknown')
  })

  it('a step whose search is still in progress is uncertain of unknown cost', async () => {
    const fetcher = answers(
      Response.json(
        search({
          output: [
            {
              type: 'web_search_call',
              status: 'in_progress',
              action: { type: 'search' },
            },
          ],
        }),
      ),
    )
    const { outcome, cost } = await run(fetcher)
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'incomplete' })
    expect(cost).toBeNull()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('a step’s own limit of 120 seconds is an ordinary failure of unknown cost', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>(
      (_, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('timed out', 'AbortError')),
          ),
        ),
    )
    const pending = run(fetcher)
    await vi.advanceTimersByTimeAsync(120_000)
    const { outcome, cost } = await pending
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'time_limit_run',
    })
    expect(cost).toBeNull()
  })

  it('any other error is uncertain with the cause unknown', async () => {
    const { outcome } = await run(answers(Response.json(search())), {
      saveState: async () => {
        throw new Error('database unavailable')
      },
    })
    expect(outcome).toMatchObject({ kind: 'uncertain', cause: 'unknown' })
  })
})

describe('T2-AC03: the paid agent session ends its own work at its maximum run time', () => {
  it('a provider that never answers and ignores the abort ends as an ordinary failure after 15 minutes', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}))
    let ended = false
    const pending = run(fetcher).then((result) => {
      ended = true
      return result
    })
    await vi.advanceTimersByTimeAsync(899_999)
    expect(ended).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const { outcome } = await pending
    expect(outcome).toMatchObject({
      kind: 'failed',
      retryable: true,
      cause: 'time_limit_run',
      usage: { sent: true, inputTokens: null },
    })
  })
})
