import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasSourcedFindings,
  NoResearchFindings,
  safeResearchUrl,
  validateResearch,
  type ResearchDraft,
  type ResearchEvidence,
  type ResearchReport,
} from '../lib/companies/research-model.ts'
import {
  citedEvidence,
  researchConfiguration,
  researchCeiling,
  runResearch,
  searchFee,
} from '../lib/companies/research-provider.ts'
import {
  draft,
  pricing,
  searchResponse,
  synthesisResponse,
} from './company-research.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'

// The settings and price lists AI keeps in code, replaced for the test.
vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

afterEach(() => vi.unstubAllEnvs())
const unknownDraft = (): ResearchDraft => ({
  ...draft(),
  claims: draft().claims.map((claim) => ({
    ...claim,
    kind: 'unknown',
    text: 'Brak potwierdzonych informacji.',
    evidence: [],
  })),
})
describe('company research evidence boundary', () => {
  it('rejects a complete five-topic report containing only unknowns', () => {
    expect(() => validateResearch(unknownDraft(), [])).toThrow(
      NoResearchFindings,
    )
  })
  it.each(['hypothesis', 'recommendation'] as const)(
    'does not treat sourced %s claims as research findings',
    (kind) => {
      const value = draft()
      value.claims = value.claims.map((claim) => ({ ...claim, kind }))
      expect(() =>
        validateResearch(value, citedEvidence(searchResponse())),
      ).toThrow(NoResearchFindings)
    },
  )
  it.each(['fact', 'opinion'] as const)(
    'accepts one sourced %s while preserving unknown topics',
    (kind) => {
      const value = unknownDraft()
      value.claims[0] = { ...draft().claims[0]!, kind }
      const report = validateResearch(value, citedEvidence(searchResponse()))
      expect(hasSourcedFindings(report)).toBe(true)
      expect(report.claims).toHaveLength(5)
      expect(
        report.claims.slice(1).every((claim) => claim.kind === 'unknown'),
      ).toBe(true)
    },
  )
  it('identifies historical empty reports without accepting uncited facts', () => {
    const historical: ResearchReport = {
      identity: unknownDraft().identity,
      claims: unknownDraft().claims.map(
        ({ evidence: _evidence, ...claim }) => ({
          ...claim,
          sources: [],
        }),
      ),
    }
    expect(hasSourcedFindings(historical)).toBe(false)
    historical.claims[0]!.kind = 'fact'
    expect(hasSourcedFindings(historical)).toBe(false)
  })
  it('only accepts safe HTTP URLs without credentials', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/plain,x',
      'https://user:pass@example.com',
      '/relative',
      'https://example.com/' + 'a'.repeat(3000),
    ])
      expect(safeResearchUrl(url)).toBe(false)
    expect(safeResearchUrl('https://example.com/path?q=1')).toBe(true)
  })
  it('binds citations to their paragraph and distinguishes opened pages from search snippets', () => {
    const response = searchResponse()
    response.output.unshift({
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'open_page', url: 'https://company.example/project' },
    } as never)
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
    const units = citedEvidence(response, '2026-11-04T00:00:00.000Z')
    expect(units).toEqual([
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
  it('rejects uncited facts/opinions, unknown evidence IDs, fabricated quotes and unsafe sources', () => {
    const evidence = citedEvidence(searchResponse())
    for (const kind of ['fact', 'opinion'] as const) {
      const value = draft()
      value.claims[0]!.kind = kind
      value.claims[0]!.evidence = []
      expect(() => validateResearch(value, evidence)).toThrow(
        'Missing evidence',
      )
    }
    for (const ref of [
      { id: 99, quote: 'Project uses PHP.' },
      { id: 0, quote: 'Project uses Go.' },
    ]) {
      const value = draft()
      value.claims[0]!.evidence = [ref]
      expect(() => validateResearch(value, evidence)).toThrow(
        'Invalid evidence',
      )
    }
    const unsafe: ResearchEvidence[] = [
      {
        ...evidence[0]!,
        sources: [{ ...evidence[0]!.sources[0]!, url: 'javascript:alert(1)' }],
      },
    ]
    expect(() => validateResearch(draft(), unsafe)).toThrow('Invalid evidence')
    expect(() =>
      validateResearch(draft(), [{ ...evidence[0]!, sources: [] }]),
    ).toThrow('Invalid evidence')
  })
  it('requires every topic and preserves offer/project scope and source kind', () => {
    const evidence = citedEvidence(searchResponse()),
      value = draft()
    value.claims[0]!.scope = 'offer'
    value.claims[0]!.kind = 'opinion'
    const report = validateResearch(value, evidence)
    expect(report.claims[0]).toMatchObject({
      kind: 'opinion',
      scope: 'offer',
      sources: [{ kind: 'search_snippet' }],
    })
    expect(report.claims[1]!.scope).toBe('project')
    value.claims[4]!.topic = 'activity'
    expect(() => validateResearch(value, evidence)).toThrow('Missing topic')
  })
})
describe('mocked research provider and accounting', () => {
  it('stops after an uncited search and settles only the completed search', async () => {
    const searched = searchResponse()
    searched.output[1]!.content![0]!.annotations = []
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searched))
    const result = await runResearch(
      { name: 'Test', kind: 'brand', website: null, description: '' },
      pricing,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      report: null,
      responseIds: ['search-id'],
      usage: { input_tokens: 8100, output_tokens: 50, search_calls: 1 },
      cost: '0.072600',
    })
    expect(result.error).toContain('Nie przygotowano raportu')
  })
  it('rejects an all-unknown synthesis while settling both completed calls', async () => {
    const synthesized = synthesisResponse()
    synthesized.output[0]!.content[0]!.text = JSON.stringify(unknownDraft())
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesized))
    const result = await runResearch(
      { name: 'Test', kind: 'brand', website: null, description: '' },
      pricing,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      report: null,
      responseIds: ['search-id', 'synthesis-id'],
      usage: { input_tokens: 8300, output_tokens: 120, search_calls: 1 },
      cost: '0.073680',
    })
    expect(result.error).toContain('Nie uznano go za gotowy research')
  })
  it('uses separate search and constrained synthesis calls and accounts for both plus search blocks', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesisResponse()))
    const result = await runResearch(
      { name: 'Test', kind: 'brand', website: null, description: 'Untrusted' },
      pricing,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    const bodies = fetcher.mock.calls.map((call) =>
      JSON.parse(String(call[1]!.body)),
    )
    expect(bodies[0]).toMatchObject({
      store: false,
      max_tool_calls: 3,
      tool_choice: 'required',
      tools: [{ type: 'web_search' }],
    })
    expect(bodies[1]).toMatchObject({
      store: false,
      tools: [],
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(JSON.parse(bodies[1].input).evidence).toEqual(
      citedEvidence(searchResponse(), expect.any(String)),
    )
    expect(result).toMatchObject({
      error: null,
      responseIds: ['search-id', 'synthesis-id'],
      usage: { input_tokens: 8300, output_tokens: 120, search_calls: 1 },
      cost: '0.073680',
    })
    expect(result.report!.claims).toHaveLength(5)
    expect(searchFee(pricing)).toBe('0.120000')
    expect(researchCeiling(pricing)).toBe('0.536000')
  })
  it('retains reservation on an ambiguous network interruption and never retries', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Disconnected'))
    const result = await runResearch(
      { name: 'Test', kind: 'unknown', website: null, description: '' },
      pricing,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.report).toBeNull()
    expect(result.cost).toBeNull()
  })
  it('settles known usage even when synthesis invents an uncited report', async () => {
    const bad = synthesisResponse()
    bad.output[0]!.content[0]!.text = JSON.stringify({
      ...draft(),
      claims: draft().claims.map((c) => ({ ...c, evidence: [] })),
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(bad))
    const result = await runResearch(
      { name: 'Test', kind: 'unknown', website: null, description: '' },
      pricing,
      fetcher,
    )
    expect(result.report).toBeNull()
    expect(result.cost).toBe('0.073680')
    expect(result.error).toBeTruthy()
  })
  it('retains the full reservation when synthesis disconnects after a paid search', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockRejectedValueOnce(new Error('Disconnected after submission'))
    const result = await runResearch(
      { name: 'Test', kind: 'brand', website: null, description: '' },
      pricing,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      report: null,
      cost: null,
      responseIds: ['search-id'],
      usage: { input_tokens: 8100, output_tokens: 50, search_calls: 1 },
    })
  })
  it('does not synthesize from an incomplete search tool or settle its ambiguous usage', async () => {
    const response = searchResponse()
    response.output[0]!.status = 'in_progress'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(response))
    const result = await runResearch(
      { name: 'Test', kind: 'brand', website: null, description: '' },
      pricing,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.report).toBeNull()
    expect(result.cost).toBeNull()
  })
  it('requires a compatible model and sufficient token ceilings', () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock-only')
    for (const invalid of [
      { ...pricing, model: 'other' },
      { ...pricing, maxInputTokens: 99999 },
      { ...pricing, maxOutputTokens: 3999 },
    ]) {
      usePricing('research', invalid)
      expect(researchConfiguration()).toBeNull()
    }
    usePricing('research', pricing)
    expect(researchConfiguration()).toEqual(pricing)
  })
  it('uses Luna reasoning and reported search tokens without charging the mini search block again', async () => {
    const luna = { ...pricing, model: 'gpt-6-luna', maxInputTokens: 500000 }
    vi.stubEnv('OPENAI_API_KEY', 'mock-only')
    for (const invalid of [
      { ...luna, maxInputTokens: 499999 },
      { ...luna, maxOutputTokens: 3999 },
    ]) {
      usePricing('research', invalid)
      expect(researchConfiguration()).toBeNull()
    }
    usePricing('research', luna)
    expect(researchConfiguration()).toEqual(luna)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesisResponse()))
    const result = await runResearch(
      { name: 'Test', kind: 'brand', website: null, description: '' },
      luna,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const call of fetcher.mock.calls)
      expect(JSON.parse(String(call[1]!.body))).toMatchObject({
        model: 'gpt-6-luna',
        reasoning: { effort: 'low' },
      })
    expect(result).toMatchObject({
      error: null,
      usage: { input_tokens: 300, output_tokens: 120, search_calls: 1 },
      cost: '0.041680',
    })
    expect(result.report!.claims).toHaveLength(5)
    expect(searchFee(luna, 1)).toBe('0.040000')
    expect(researchCeiling(luna)).toBe('2.136000')
  })
})
