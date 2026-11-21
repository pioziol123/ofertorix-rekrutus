import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  AssignmentError,
  agentTools,
  placeAssignment,
  safeSourceUrl,
  type AgentMaterial,
  type AgentSource,
  type AssignmentRequest,
} from '../index.ts'

vi.mock('./assignment-settings.ts', () => ({
  assignmentSettings: {
    research: {
      executor: 'openai',
      parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
      requestingModule: 'Research',
    },
  },
}))

describe('the shared rules of an agent session in the contract of assignments (T1-AC07, T1-R09)', () => {
  it('lists web search as the one tool an agent assignment may ask for', () => {
    expect(agentTools).toEqual(['web_search'])
  })

  it('keeps the rule of a safe source address: HTTP(S), no credentials, at most 3000 characters', () => {
    expect(safeSourceUrl('https://example.com/about')).toBe(true)
    expect(safeSourceUrl('http://example.com')).toBe(true)
    expect(safeSourceUrl(`https://example.com/${'a'.repeat(2980)}`)).toBe(true)
    expect(safeSourceUrl(`https://example.com/${'a'.repeat(2981)}`)).toBe(false)
    expect(safeSourceUrl('ftp://example.com')).toBe(false)
    expect(safeSourceUrl('https://user:secret@example.com')).toBe(false)
    expect(safeSourceUrl('not a url')).toBe(false)
  })

  it('keeps the shape of the materials an agent gathers: a text with the sources it cites', () => {
    expectTypeOf<AgentMaterial>().toEqualTypeOf<{
      id: number
      text: string
      sources: AgentSource[]
    }>()
    expectTypeOf<AgentSource>().toEqualTypeOf<{
      url: string
      title: string
      kind: 'page' | 'search_snippet'
      accessedAt: string
    }>()
  })

  it('refuses, before anything is created, a tool outside the list', async () => {
    const request = {
      settingsName: 'research',
      type: 'agent',
      label: 'Example Ltd',
      instruction: 'Gather sources.',
      input: 'Example Ltd',
      agent: {
        tools: ['web_search', 'shell'],
        resultInstruction: 'Write the report.',
      },
    } as unknown as AssignmentRequest
    await expect(placeAssignment(request)).rejects.toEqual(
      new AssignmentError('unknown_tool'),
    )
  })
})
