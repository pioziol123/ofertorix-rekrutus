import { describe, expect, it } from 'vitest'
import {
  assessmentSchema,
  calculate,
  exceedsCriteria,
  maxCriteria,
  matchingInput,
  salaryCheck,
  validateAssessment,
  type Assessment,
  type MatchingInput,
} from './assessment.ts'
import { emptyProfile, emptySkill } from '../../profile/view.ts'
import type { OfferView } from '../../offers/index.ts'

const offer = (changes: Partial<OfferView> = {}): OfferView => ({
  id: 'offer',
  title: 'Senior PHP',
  company: 'Example',
  url: null,
  description: 'PHP backend',
  skills: [{ name: 'PHP', optional: false }],
  salaries: [],
  locations: [],
  seniority: 'senior',
  hours: null,
  mode: 'remote',
  firstSeen: '',
  lastSeen: '',
  published: null,
  validTo: null,
  availability: 'available',
  expired: false,
  revisions: [],
  ...changes,
})
const input: MatchingInput = {
  profile: 'PHP backend and Vue applications',
  offer: 'PHP backend and Vue applications',
  checks: [],
  criteria: [
    { id: 'php', group: 'technologies', label: 'PHP', unknown: false },
    { id: 'vue', group: 'technologies', label: 'Vue', unknown: false },
    { id: 'role', group: 'experience', label: 'Backend', unknown: false },
    { id: 'mode', group: 'conditions', label: 'Remote', unknown: false },
    { id: 'goal', group: 'direction', label: 'Applications', unknown: false },
  ],
}
const assessment = (): Assessment => ({
  summary: 'Ocena',
  strengths: [],
  gaps: [],
  criteria: input.criteria.map((c) => ({
    id: c.id,
    state: 'match',
    score: 100,
    profileEvidence: 'PHP backend',
    offerEvidence: 'PHP backend',
    reason: 'Potwierdzone',
  })),
})

describe('matching arithmetic and evidence', () => {
  it('uses configured group weights and equal weights within a group', () => {
    const value = assessment()
    value.criteria.forEach((c, i) => {
      c.score = [100, 0, 80, 50, 0][i]!
    })
    expect(calculate(value, input)).toMatchObject({
      rating: 50,
      completeness: 100,
    })
  })
  it('omits unknown scores from rating while retaining weighted completeness', () => {
    const value = assessment()
    value.criteria[1] = {
      ...value.criteria[1]!,
      state: 'unknown',
      score: null,
      profileEvidence: null,
      offerEvidence: null,
    }
    value.criteria[2] = {
      ...value.criteria[2]!,
      state: 'unknown',
      score: null,
      profileEvidence: null,
      offerEvidence: null,
    }
    expect(calculate(value, input)).toMatchObject({
      rating: 100,
      completeness: 55,
      components: [
        { group: 'technologies', score: 100, completeness: 50 },
        { group: 'experience', score: null, completeness: 0 },
        { group: 'conditions', score: 100, completeness: 100 },
        { group: 'direction', score: 100, completeness: 100 },
      ],
    })
  })
  it('leaves wholly unknown results unrated rather than zero', () => {
    const value = assessment()
    value.criteria.forEach((c) => {
      c.state = 'unknown'
      c.score = null
      c.profileEvidence = null
      c.offerEvidence = null
    })
    expect(calculate(value, input)).toMatchObject({
      rating: null,
      completeness: 0,
    })
  })
  it('allows source whitespace differences in exact evidence', () => {
    expect(
      validateAssessment(assessment(), { ...input, profile: 'PHP\nbackend' }),
    ).toMatchObject({ criteria: assessment().criteria })
  })
  it.each([
    'missing',
    'duplicate',
    'extra',
    'fabricated',
    'unknown-score',
    'known-null',
    'unknown-profile',
    'missing-evidence',
    'blank-evidence',
  ])('rejects %s assessment', (kind) => {
    const value = assessment(),
      source = structuredClone(input)
    if (kind === 'missing') value.criteria.pop()
    if (kind === 'duplicate') value.criteria[1]!.id = 'php'
    if (kind === 'extra')
      value.criteria.push({ ...value.criteria[0]!, id: 'extra' })
    if (kind === 'fabricated') value.criteria[0]!.offerEvidence = 'Rust expert'
    if (kind === 'unknown-score') value.criteria[0]!.state = 'unknown'
    if (kind === 'known-null') value.criteria[0]!.score = null
    if (kind === 'unknown-profile') source.criteria[0]!.unknown = true
    if (kind === 'missing-evidence') value.criteria[0]!.profileEvidence = null
    if (kind === 'blank-evidence') value.criteria[0]!.profileEvidence = '   '
    expect(() => validateAssessment(value, source)).toThrow()
  })
  it.each([
    [
      'schema',
      (v: Assessment) =>
        Object.assign(v, { summary: { private: 'secret source' } }),
    ],
    ['criterion_mismatch', (v: Assessment) => v.criteria.pop()],
    [
      'missing_criterion',
      (v: Assessment) => {
        v.criteria[0]!.id = 'untrusted criterion secret'
      },
    ],
    [
      'unknown_score',
      (v: Assessment) => {
        v.criteria[0]!.state = 'unknown'
      },
    ],
    [
      'rated_score_missing',
      (v: Assessment) => {
        v.criteria[0]!.score = null
      },
    ],
    [
      'rated_evidence_missing',
      (v: Assessment) => {
        v.criteria[0]!.profileEvidence = null
      },
    ],
    [
      'unsupported_assessment',
      (v: Assessment) => {
        v.criteria[0]!.reason = '   '
      },
    ],
    [
      'profile_evidence_missing',
      (v: Assessment) => {
        v.criteria[0]!.profileEvidence = 'private profile fabricated secret'
      },
    ],
    [
      'offer_evidence_missing',
      (v: Assessment) => {
        v.criteria[0]!.offerEvidence = 'private offer fabricated secret'
      },
    ],
  ] as const)(
    'classifies %s without including input or provider content',
    (code, mutate) => {
      const value = assessment()
      mutate(value)
      try {
        validateAssessment(value, input)
        expect.fail('Expected validation rejection')
      } catch (error) {
        expect(error).toMatchObject({ code, message: code })
        expect(String(error)).not.toMatch(/secret|private|untrusted/)
      }
    },
  )
  it('distinguishes rating an unknown criterion from absent evidence', () => {
    const source = structuredClone(input)
    source.criteria[0]!.unknown = true
    expect(() => validateAssessment(assessment(), source)).toThrow(
      'unknown_criterion_rated',
    )
  })
  it('accepts explicit unknown with no evidence', () => {
    const value = assessment()
    value.criteria[0] = {
      ...value.criteria[0]!,
      state: 'unknown',
      score: null,
      profileEvidence: null,
      offerEvidence: null,
    }
    expect(validateAssessment(value, input).criteria).toEqual(value.criteria)
  })
})

describe('professional matching input', () => {
  it('marks absent profile skill as unknown and deduplicates offer skills case-insensitively', () => {
    const profile = emptyProfile()
    profile.skills.push({ ...emptySkill(), name: 'php' })
    const result = matchingInput(
      profile,
      offer({
        skills: [
          { name: 'PHP', optional: false },
          { name: 'php', optional: false },
          { name: 'Go', optional: true },
        ],
      }),
    )
    expect(result.criteria.filter((c) => c.group === 'technologies')).toEqual([
      {
        id: 'technology:0',
        group: 'technologies',
        label: 'php',
        unknown: false,
      },
      {
        id: 'technology:1',
        group: 'technologies',
        label: 'Go (opcjonalna)',
        unknown: true,
      },
    ])
  })
  it('skips no-preference conditions and salary', () => {
    const profile = emptyProfile()
    Object.values(profile.expectations).forEach((v) => {
      v.state = 'no_preference'
    })
    profile.salary.state = 'no_preference'
    expect(
      matchingInput(profile, offer()).criteria.filter(
        (c) => c.group === 'conditions',
      ),
    ).toEqual([])
  })
  it.each([
    ['onsite', 'conflict'],
    ['remote', 'match'],
    [null, 'unknown'],
  ] as const)(
    'checks required remote preference against %s as %s',
    (mode, state) => {
      const profile = emptyProfile()
      profile.expectations.workMode = {
        state: 'specified',
        importance: 'required',
        value: 'zdalnie',
      }
      expect(matchingInput(profile, offer({ mode })).checks).toContainEqual(
        expect.objectContaining({ criterion: 'workMode', state }),
      )
    },
  )
  it('redacts contacts without changing profile, IDs, or version', () => {
    const profile = emptyProfile()
    profile.summary =
      'PHP since 2015. Email: person@example.com tel. +48 534 641 002'
    profile.skills.push({ ...emptySkill(), name: 'PHP' })
    const original = structuredClone(profile)
    const result = matchingInput(
      profile,
      offer({
        description:
          'Contact recruiter@example.com tel. +48 534 641 002. PHP backend',
      }),
    )
    expect(result.profile + result.offer).not.toContain('example.com')
    expect(result.profile + result.offer).not.toContain('534')
    expect(result.profile).toContain('2015')
    expect(result.profile).not.toContain(profile.skills[0]!.id)
    expect(profile).toEqual(original)
  })
})

describe('salary gate without inferred exchange rates or contract mixing', () => {
  const wanted = {
    ...emptyProfile().salary,
    state: 'specified' as const,
    importance: 'required' as const,
    minimum: '25000',
    currency: 'PLN',
    period: 'Month' as const,
    contract: 'B2B',
    basis: 'net_plus_vat' as const,
  }
  const salary = (
    changes: Partial<OfferView['salaries'][number]> = {},
  ): OfferView['salaries'][number] => ({
    from: 25000,
    to: 28000,
    currency: 'PLN',
    period: 'Month',
    contract: 'B2B',
    basis: 'net_plus_vat',
    origin: 'employer',
    ...changes,
  })
  it.each([
    [20000, 28000, 'match'],
    [20000, 24000, 'conflict'],
    [25000, 28000, 'match'],
  ] as const)('compares minimum against %s–%s as %s', (from, to, state) => {
    const result = salaryCheck(wanted, [salary({ from, to })])
    expect(result.state).toBe(state)
    if (from < 25000 && to >= 25000)
      expect(result.reason).toContain('Częściowe pokrycie')
  })
  it.each([
    { currency: 'EUR' },
    { basis: null },
    { basis: 'gross' },
    { period: 'Hour' },
    { contract: 'UoP' },
    { origin: 'portal_estimate' },
    { origin: 'unknown' },
  ] as const)('keeps incomparable salary variant %j unknown', (changes) => {
    expect(salaryCheck(wanted, [salary(changes)]).state).toBe('unknown')
  })
  it('does not combine currency, contract or amount across variants', () => {
    expect(
      salaryCheck(wanted, [
        salary({ to: 24000 }),
        salary({ currency: 'EUR', to: 50000 }),
        salary({ contract: 'UoP', to: 50000 }),
      ]).state,
    ).toBe('unknown')
  })
  it('shows conflict between comparable alternatives while accepting a matching variant', () => {
    expect(
      salaryCheck(wanted, [salary({ to: 24000 }), salary()]),
    ).toMatchObject({
      state: 'match',
      reason: expect.stringContaining('Rozbieżność'),
    })
  })
  it('treats unbounded upper ranges conservatively', () => {
    expect(salaryCheck(wanted, [salary({ from: 20000, to: null })]).state).toBe(
      'unknown',
    )
    expect(salaryCheck(wanted, [salary({ from: 25000, to: null })]).state).toBe(
      'match',
    )
  })
  it('discards unsupported aggregate gaps when every criterion is unknown', () => {
    const value = assessment()
    value.criteria.forEach((c) => {
      c.state = 'unknown'
      c.score = null
      c.profileEvidence = null
      c.offerEvidence = null
    })
    value.strengths = ['Invented strength']
    value.gaps = ['Invented gap']
    value.summary = 'Invented conclusion'
    expect(validateAssessment(value, input)).toMatchObject({
      strengths: [],
      gaps: [],
      summary: 'Brak wystarczających danych do oceny dopasowania.',
    })
  })
})

describe('owner authority and configurable weights', () => {
  it('permits owner knowledge on unknown inputs while keeping AI strict', () => {
    const unknownInput = {
      ...input,
      criteria: input.criteria.map((c) => ({ ...c, unknown: true })),
    }
    const value = assessment()
    value.criteria.forEach((c) => {
      c.profileEvidence = null
      c.offerEvidence = null
    })
    expect(() => validateAssessment(value, unknownInput)).toThrow()
    expect(
      validateAssessment(value, unknownInput, 'owner').criteria[0],
    ).toMatchObject({ score: 100, state: 'match' })
    value.criteria[0]!.profileEvidence = 'invented quote'
    expect(() => validateAssessment(value, unknownInput, 'owner')).toThrow()
  })
  it.each([
    { technologies: 40, experience: 25, conditions: 20, direction: 14 },
    { technologies: 100.5, experience: 0, conditions: 0, direction: -0.5 },
    { technologies: 101, experience: -1, conditions: 0, direction: 0 },
  ])('rejects invalid weight configuration %j', (weights) => {
    expect(() => calculate(assessment(), input, weights)).toThrow()
  })
  it('supports zero group weights without changing unknown scores or evidence', () => {
    const value = assessment()
    value.criteria[0]!.score = 0
    value.criteria[1]!.score = 0
    const original = structuredClone(value)
    expect(
      calculate(value, input, {
        technologies: 0,
        experience: 100,
        conditions: 0,
        direction: 0,
      }),
    ).toMatchObject({ rating: 100, completeness: 100 })
    expect(value).toEqual(original)
  })
})

describe('the criteria limit of an assessment (0mq.21 ASM-6)', () => {
  const criteria = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `criterion_${i}`,
      group: 'technologies' as const,
      label: 'PHP',
      unknown: true,
    }))
  it('refuses more criteria than the assessment contract can return', () => {
    expect(maxCriteria).toBe(200)
    expect(exceedsCriteria({ criteria: criteria(200) })).toBe(false)
    expect(exceedsCriteria({ criteria: criteria(201) })).toBe(true)
    const entry = (id: string) => ({
      id,
      state: 'unknown',
      score: null,
      profileEvidence: null,
      offerEvidence: null,
      reason: 'Brak danych',
    })
    const result = (n: number) => ({
      summary: 'Ocena',
      strengths: [],
      gaps: [],
      criteria: criteria(n).map((c) => entry(c.id)),
    })
    // The reason: an assessment with more criteria never passes the contract.
    expect(assessmentSchema.safeParse(result(200)).success).toBe(true)
    expect(assessmentSchema.safeParse(result(201)).success).toBe(false)
  })
})
