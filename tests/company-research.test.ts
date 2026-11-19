import { describe, expect, it } from 'vitest'
import {
  hasSourcedFindings,
  NoResearchFindings,
  validateResearch,
  type ResearchDraft,
  type ResearchEvidence,
  type ResearchReport,
} from '../lib/companies/research-model.ts'
import { safeSourceUrl } from '../modules/ai/index.ts'
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
  it('takes the safe source rule from one owner: the agent keeps exactly the sources Companies accepts (0mq.22 ASM-5)', () => {
    const unsafeUrls = [
      'javascript:alert(1)',
      'data:text/plain,x',
      'https://user:pass@example.com',
      '/relative',
      'https://example.com/' + 'a'.repeat(3000),
    ]
    const safeUrls = [
      'https://example.com/path?q=1',
      'https://example.com/' + 'a'.repeat(3000 - 'https://example.com/'.length),
    ]
    for (const url of unsafeUrls) expect(safeSourceUrl(url)).toBe(false)
    for (const url of safeUrls) expect(safeSourceUrl(url)).toBe(true)
    for (const url of [...unsafeUrls, ...safeUrls]) {
      const response = searchResponse()
      response.output[1]!.content![0]!.annotations![0]!.url = url
      const materials = citedEvidence(response)
      const kept = materials.length > 0
      expect(kept).toBe(safeSourceUrl(url))
      const sources = [
        { ...citedEvidence(searchResponse())[0]!.sources[0]!, url },
      ]
      const validated = (() => {
        try {
          validateResearch(draft(), [
            { ...citedEvidence(searchResponse())[0]!, sources },
          ])
          return true
        } catch {
          return false
        }
      })()
      expect(validated).toBe(kept)
    }
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
