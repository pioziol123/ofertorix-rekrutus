import { describe, expect, it } from 'vitest'
import { agentFits, citedMaterials } from './openai-search.ts'

/**
 * What the paid agent session reads from a search answer, kept from the
 * old way's agent (0mq.22): the materials and the caps the session fits.
 */

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

describe('the caps of the agent session', () => {
  it('fits only a model it knows, with the token caps and tool calls the work needs', () => {
    const caps = {
      model: 'gpt-4.1-mini',
      maxInputTokens: 100000,
      maxOutputTokens: 4000,
      maxToolCalls: 3,
    }
    const fits = (overrides: Partial<typeof caps>) =>
      agentFits({ ...caps, ...overrides })
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

  it('refuses an answer of another shape, and a search that did not complete', () => {
    expect(() => citedMaterials({ steps: 'x' })).toThrow()
    expect(() =>
      citedMaterials({ ...searchResponse(), status: 'incomplete' }),
    ).toThrow()
  })
})
