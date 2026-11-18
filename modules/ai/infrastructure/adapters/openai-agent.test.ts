import { describe, expect, it, vi } from 'vitest'
import type { AgentRequest, ProviderSettings } from '../../provider-adapter.ts'
import { citedMaterials, openAiAgent } from './openai-agent.ts'
import { openAiProvider } from './openai.ts'

/**
 * The agent mode of the OpenAI adapter, moved from Companies' research
 * provider (0mq.22): the same two requests, materials and usage as
 * before, with a simulated transport.
 */

const settings = (overrides: Partial<ProviderSettings> = {}) =>
  ({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    reasoningEffort: null,
    maxInputTokens: 100000,
    maxOutputTokens: 4000,
    maxToolCalls: 3,
    runtime: null,
    ...overrides,
  }) satisfies ProviderSettings

const request: AgentRequest = {
  model: 'gpt-4.1-mini',
  instructions: 'Gather facts about the target.',
  resultInstructions: 'Write the result from the evidence units.',
  input: JSON.stringify({ name: 'Test', kind: 'brand' }),
  output: { name: 'result', schema: { type: 'object' } },
  tools: ['web_search'],
}

type SearchResponse = {
  id: string
  status: string
  usage: { input_tokens: number; output_tokens: number }
  output: {
    type: string
    status?: string
    action?: { type: string; url?: string }
    content?: {
      type: string
      text: string
      annotations: Record<string, unknown>[]
    }[]
  }[]
}
const searchResponse = (): SearchResponse => ({
  id: 'search-id',
  status: 'completed',
  usage: { input_tokens: 100, output_tokens: 50 },
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
})
const synthesisResponse = (text = '{"summary":"PHP"}') => ({
  id: 'synthesis-id',
  status: 'completed',
  usage: { input_tokens: 200, output_tokens: 70 },
  output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
})

/** Runs the agent with the transport and keeps every state it saved. */
async function run(
  fetcher: typeof fetch,
  options: { settings?: ProviderSettings; save?: () => Promise<void> } = {},
) {
  const saved: unknown[] = []
  const agent = openAiAgent(
    options.settings ?? settings(),
    fetcher,
    () => 'test-key',
  )
  const outcome = await agent.run(request, {
    save: async (state) => {
      await options.save?.()
      saved.push(structuredClone(state))
    },
  })
  return { outcome, saved, agent }
}

describe('the OpenAI agent: search, then synthesis from cited materials', () => {
  it('sends the search with its tool limit, then the synthesis in the response schema from the materials', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesisResponse()))
    const { outcome, saved, agent } = await run(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const bodies = fetcher.mock.calls.map((call) =>
      JSON.parse(String(call[1]!.body)),
    )
    expect(bodies[0]).toEqual({
      model: 'gpt-4.1-mini',
      store: false,
      service_tier: 'default',
      max_output_tokens: 2000,
      tools: [{ type: 'web_search', search_context_size: 'low' }],
      tool_choice: 'required',
      max_tool_calls: 3,
      instructions: request.instructions,
      input: request.input,
    })
    const materials = citedMaterials(searchResponse(), expect.any(String))
    expect(bodies[1]).toMatchObject({
      store: false,
      tools: [],
      instructions: request.resultInstructions,
      text: {
        format: {
          type: 'json_schema',
          name: 'result',
          strict: true,
          schema: { type: 'object' },
        },
      },
    })
    expect(JSON.parse(bodies[1].input)).toEqual({
      target: { name: 'Test', kind: 'brand' },
      evidence: materials,
    })
    // The fixed search block of gpt-4.1-mini is charged per search.
    expect(outcome).toMatchObject({
      kind: 'response',
      response: { outcome: 'completed', text: '{"summary":"PHP"}' },
      usage: { inputTokens: 8300, outputTokens: 120, toolCalls: 1 },
      unmeasured: false,
      responseIds: ['search-id', 'synthesis-id'],
    })
    // AC-AC01: the step log keeps the usage of each step.
    const state = saved.at(-1)
    expect(state).toMatchObject({
      steps: [
        {
          step: 'search',
          status: 'completed',
          responseId: 'search-id',
          usage: { inputTokens: 100, outputTokens: 50, toolCalls: 1 },
        },
        {
          step: 'synthesis',
          status: 'completed',
          responseId: 'synthesis-id',
          usage: { inputTokens: 200, outputTokens: 70, toolCalls: 0 },
        },
      ],
    })
    expect(agent.materials(state)).toEqual(
      citedMaterials(searchResponse(), expect.any(String)),
    )
  })

  it('saves each step as sent before sending it', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesisResponse()))
    const { saved } = await run(fetcher)
    const statuses = saved.map((s) =>
      (s as { steps: { status: string }[] }).steps.map((step) => step.status),
    )
    expect(statuses[0]).toEqual(['sent'])
    expect(statuses).toContainEqual(['completed', 'sent'])
  })

  it('uses the reasoning effort of the settings and the reported search tokens of gpt-6-luna', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesisResponse()))
    const { outcome } = await run(fetcher, {
      settings: settings({
        model: 'gpt-6-luna',
        reasoningEffort: 'low',
        maxInputTokens: 500000,
      }),
    })
    for (const call of fetcher.mock.calls)
      expect(JSON.parse(String(call[1]!.body))).toMatchObject({
        model: 'gpt-6-luna',
        reasoning: { effort: 'low' },
      })
    expect(outcome.usage).toEqual({
      inputTokens: 300,
      outputTokens: 120,
      toolCalls: 1,
    })
  })

  it('stops after a search without cited material: failed, no synthesis, the search measured', async () => {
    const searched = searchResponse()
    searched.output[1]!.content![0]!.annotations = []
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searched))
    const { outcome } = await run(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({
      kind: 'end',
      end: { state: 'failed', cause: 'no_content' },
      usage: { inputTokens: 8100, outputTokens: 50, toolCalls: 1 },
      unmeasured: false,
      responseIds: ['search-id'],
    })
  })

  it('E04-AC03: keeps the measured search when the synthesis disconnects, and leaves the cost unknown', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockRejectedValueOnce(new Error('Disconnected after submission'))
    const { outcome, saved } = await run(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(outcome).toMatchObject({
      kind: 'end',
      end: { state: 'uncertain', cause: 'network' },
      usage: { inputTokens: 8100, outputTokens: 50, toolCalls: 1 },
      unmeasured: true,
      responseIds: ['search-id'],
    })
    expect(saved.at(-1)).toMatchObject({
      steps: [
        { step: 'search', status: 'completed' },
        { step: 'synthesis', status: 'unknown', responseId: null },
      ],
    })
  })

  it.each([
    [
      'a network interruption',
      () => Promise.reject(new Error('Down')),
      'network',
    ],
    [
      'an HTTP error',
      async () => new Response('busy', { status: 503 }),
      'http',
    ],
    ['an unreadable response', async () => new Response('{]'), 'format'],
  ] as const)(
    'ends the search after %s as uncertain, with the cost unknown and no retry',
    async (_, answer, cause) => {
      const fetcher = vi.fn<typeof fetch>(answer)
      const { outcome } = await run(fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(outcome).toMatchObject({
        kind: 'end',
        end: { state: 'uncertain', cause },
        unmeasured: true,
      })
    },
  )

  it('does not synthesize from a search tool still in progress, and does not settle its usage', async () => {
    const searched = searchResponse()
    searched.output[0]!.status = 'in_progress'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searched))
    const { outcome } = await run(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({
      kind: 'end',
      end: { state: 'uncertain', cause: 'incomplete' },
      unmeasured: true,
    })
  })

  it('ends a synthesis without one text as failed with both steps measured', async () => {
    const synthesized = synthesisResponse()
    synthesized.output[0]!.content = []
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesized))
    const { outcome } = await run(fetcher)
    expect(outcome).toMatchObject({
      kind: 'end',
      end: { state: 'failed', cause: 'format' },
      unmeasured: false,
      usage: { inputTokens: 8300, outputTokens: 120, toolCalls: 1 },
    })
  })

  it('sends nothing more once a save fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(searchResponse()))
    let saves = 0
    await expect(
      run(fetcher, {
        save: async () => {
          // The save after the search response fails.
          if (++saves === 2) throw new Error('The execution no longer runs')
        },
      }),
    ).rejects.toThrow('no longer runs')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sends nothing without the provider secret', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const outcome = await openAiAgent(settings(), fetcher, () => undefined).run(
      request,
      { save: async () => {} },
    )
    expect(fetcher).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({
      kind: 'end',
      end: { state: 'failed', cause: 'configuration' },
      unmeasured: false,
    })
  })

  it('fits only a model it knows, with the token caps and tool calls the work needs', () => {
    const fits = (overrides: Partial<ProviderSettings>) =>
      openAiProvider().modes.agent!(settings(overrides)).fits()
    expect(fits({})).toBe(true)
    expect(fits({ model: 'other' })).toBe(false)
    expect(fits({ maxInputTokens: 99999 })).toBe(false)
    expect(fits({ maxOutputTokens: 3999 })).toBe(false)
    expect(fits({ maxToolCalls: undefined })).toBe(false)
    expect(fits({ model: 'gpt-6-luna', maxInputTokens: 500000 })).toBe(true)
    expect(fits({ model: 'gpt-6-luna', maxInputTokens: 499999 })).toBe(false)
  })
})

describe('the materials of a search', () => {
  it('binds citations to their paragraph and tells opened pages from search snippets', () => {
    const response = searchResponse()
    response.output.unshift({
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'open_page', url: 'https://company.example/project' },
    })
    const part = response.output.at(-1)!.content![0]!
    part.text = 'Project uses PHP.\nUncited claim.\nSearch result.'
    part.annotations.push(
      {
        type: 'url_citation',
        url: 'javascript:alert(1)',
        title: 'Unsafe',
        start_index: 18,
        end_index: 25,
      },
      {
        type: 'url_citation',
        url: 'https://cross.example',
        title: 'Cross paragraph',
        start_index: 10,
        end_index: 22,
      },
      {
        type: 'url_citation',
        url: 'https://snippet.example',
        title: 'Search',
        start_index: 33,
        end_index: 40,
      },
    )
    expect(citedMaterials(response, '2026-11-04T00:00:00.000Z')).toEqual([
      {
        id: 0,
        text: 'Project uses PHP.',
        sources: [
          {
            url: 'https://company.example/project',
            title: 'Project',
            kind: 'page',
            accessedAt: '2026-11-04T00:00:00.000Z',
          },
        ],
      },
      {
        id: 1,
        text: 'Search result.',
        sources: [
          {
            url: 'https://snippet.example',
            title: 'Search',
            kind: 'search_snippet',
            accessedAt: '2026-11-04T00:00:00.000Z',
          },
        ],
      },
    ])
  })

  it('refuses to read materials from a state of another shape', () => {
    expect(() =>
      openAiAgent(settings(), vi.fn()).materials({ steps: 'x' }),
    ).toThrow()
  })
})
