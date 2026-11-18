import { describe, expect, it } from 'vitest'
import {
  hasSourcedFindings,
  NoResearchFindings,
  safeResearchUrl,
  validateResearch,
  type ResearchDraft,
  type ResearchEvidence,
  type ResearchReport,
} from '../lib/companies/research-model.ts'
import { citedMaterials } from '../modules/ai/infrastructure/adapters/openai-agent.ts'
import { draft, searchResponse } from './company-research.fixtures.ts'

/** The evidence the AI agent gathers from the fixture search. */
const citedEvidence = (value: unknown) => citedMaterials(value)

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
