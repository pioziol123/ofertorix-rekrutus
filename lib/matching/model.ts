import { defaultWeights, weightsSchema, type Weights } from './weights.ts'
import { z } from 'zod'
import type { ProfileData } from '../../modules/profile/index.ts'
import type { SourceAdContent } from '../../modules/sources/index.ts'
import { scrubContacts } from '../contact-details.ts'

export const groups = [
  'technologies',
  'experience',
  'conditions',
  'direction',
] as const
export type Group = (typeof groups)[number]
export const weights = defaultWeights
/**
 * The most criteria one assessment covers: the assessment contract takes no
 * more, so a request with more could never be published.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-6): the reason the limit applies to
 * every assessment request, single or in a group.
 */
export const maxCriteria = 200
/** Whether an input has more criteria than an assessment can cover. */
export const exceedsCriteria = (input: { criteria: unknown[] }) =>
  input.criteria.length > maxCriteria
export type Criterion = {
  id: string
  group: Group
  label: string
  unknown: boolean
}
export type MatchingInput = {
  profile: string
  offer: string
  criteria: Criterion[]
  checks: {
    criterion: string
    state: 'match' | 'conflict' | 'unknown'
    reason: string
  }[]
}
const entry = z
  .object({
    id: z.string().min(1).max(120),
    state: z.enum(['match', 'gap', 'unknown']),
    score: z.number().min(0).max(100).nullable(),
    profileEvidence: z.string().min(1).max(2000).nullable(),
    offerEvidence: z.string().min(1).max(2000).nullable(),
    reason: z.string().min(1).max(3000),
  })
  .strict()
export const assessmentSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    criteria: z.array(entry).max(maxCriteria),
    strengths: z.array(z.string().min(1).max(1000)).max(20),
    gaps: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict()
export type Assessment = z.infer<typeof assessmentSchema>
export class AssessmentError extends Error {
  constructor(
    public readonly code:
      | 'schema'
      | 'criterion_mismatch'
      | 'missing_criterion'
      | 'unknown_score'
      | 'unsupported_assessment'
      | 'unknown_criterion_rated'
      | 'rated_score_missing'
      | 'rated_evidence_missing'
      | 'profile_evidence_missing'
      | 'offer_evidence_missing',
  ) {
    super(code)
  }
}
const normalize = (s: string) => s.replace(/\s+/gu, ' ').trim()
export function validateAssessment(
  value: unknown,
  input: MatchingInput,
  authority: 'ai' | 'owner' = 'ai',
): Assessment {
  const parsed = assessmentSchema.safeParse(value)
  if (!parsed.success) throw new AssessmentError('schema')
  const result = parsed.data
  const byId = new Map(result.criteria.map((c) => [c.id, c]))
  if (
    byId.size !== result.criteria.length ||
    byId.size !== input.criteria.length
  )
    throw new AssessmentError('criterion_mismatch')
  for (const criterion of input.criteria) {
    const item = byId.get(criterion.id)
    if (!item) throw new AssessmentError('missing_criterion')
    if (item.state === 'unknown') {
      if (item.score !== null) throw new AssessmentError('unknown_score')
    } else {
      if (item.score === null) throw new AssessmentError('rated_score_missing')
      if (!item.reason.trim())
        throw new AssessmentError('unsupported_assessment')
      if (authority === 'ai') {
        if (criterion.unknown)
          throw new AssessmentError('unknown_criterion_rated')
        if (!item.profileEvidence || !item.offerEvidence)
          throw new AssessmentError('rated_evidence_missing')
      }
    }
    for (const [evidence, source, side] of [
      [item.profileEvidence, input.profile, 'profile'],
      [item.offerEvidence, input.offer, 'offer'],
    ] as const)
      if (
        evidence &&
        (!normalize(evidence) ||
          !normalize(source).includes(normalize(evidence)))
      )
        throw new AssessmentError(
          side === 'profile'
            ? 'profile_evidence_missing'
            : 'offer_evidence_missing',
        )
  }
  result.strengths = result.criteria
    .filter((c) => c.state === 'match' && c.score !== null)
    .slice(0, 20)
    .map((c) => c.reason.slice(0, 1000))
  result.gaps = result.criteria
    .filter((c) => c.state === 'gap' && c.score !== null)
    .slice(0, 20)
    .map((c) => c.reason.slice(0, 1000))
  if (authority === 'ai' && result.criteria.every((c) => c.state === 'unknown'))
    result.summary = 'Brak wystarczających danych do oceny dopasowania.'
  return result
}
export function calculate(
  result: Assessment,
  input: MatchingInput,
  configured: Weights = weights,
) {
  const activeWeights = weightsSchema.parse(configured)
  const components = groups.map((group) => {
    const expected = input.criteria.filter((c) => c.group === group)
    const known = expected
      .map((c) => result.criteria.find((r) => r.id === c.id)?.score)
      .filter((score): score is number => typeof score === 'number')
    return {
      group,
      score: known.length
        ? known.reduce((a, b) => a + b, 0) / known.length
        : null,
      completeness: expected.length ? known.length / expected.length : 0,
    }
  })
  const denominator = components.reduce(
    (sum, c) => sum + (c.score === null ? 0 : activeWeights[c.group]),
    0,
  )
  return {
    rating: denominator
      ? Math.round(
          components.reduce(
            (sum, c) => sum + (c.score ?? 0) * activeWeights[c.group],
            0,
          ) / denominator,
        )
      : null,
    completeness: Math.round(
      components.reduce(
        (sum, c) => sum + c.completeness * activeWeights[c.group],
        0,
      ),
    ),
    components: components.map((c) => ({
      ...c,
      score: c.score === null ? null : Math.round(c.score),
      completeness: Math.round(c.completeness * 100),
    })),
  }
}

export function salaryCheck(
  wanted: ProfileData['salary'],
  salaries: SourceAdContent['salaries'],
): MatchingInput['checks'][number] {
  const basis = (v: string | null | undefined): string | undefined =>
    ({
      gross: 'gross',
      brutto: 'gross',
      net: 'net',
      netto: 'net',
      net_plus_vat: 'net_plus_vat',
      'netto + vat': 'net_plus_vat',
    })[v?.trim().toLowerCase() as 'gross']
  const minimum = Number(wanted.minimum)
  const variants = salaries.map((s) => {
    if (
      s.origin === 'portal_estimate' ||
      s.origin === 'unknown' ||
      s.currency !== wanted.currency ||
      s.period !== wanted.period ||
      s.contract !== wanted.contract ||
      basis(s.basis) !== wanted.basis
    )
      return { state: 'unknown' as const, partial: false }
    if (s.to !== null)
      return {
        state: s.to >= minimum ? ('match' as const) : ('conflict' as const),
        partial: s.to >= minimum && s.from !== null && s.from < minimum,
      }
    return {
      state:
        s.from !== null && s.from >= minimum
          ? ('match' as const)
          : ('unknown' as const),
      partial: false,
    }
  })
  const match = variants.find((v) => v.state === 'match')
  const conflict = variants.some((v) => v.state === 'conflict')
  if (match)
    return {
      criterion: 'salary',
      state: 'match',
      reason: `Co najmniej jeden porównywalny wariant spełnia minimum.${match.partial ? ' Częściowe pokrycie widełek — oczekiwana kwota nie jest gwarantowana.' : ''}${conflict ? ' Rozbieżność: inny wariant nie spełnia minimum.' : ''}`,
    }
  if (variants.length && variants.every((v) => v.state === 'conflict'))
    return {
      criterion: 'salary',
      state: 'conflict',
      reason:
        'Wszystkie porównywalne warianty są poniżej oczekiwanego minimum.',
    }
  return {
    criterion: 'salary',
    state: 'unknown',
    reason:
      'Brak pełnego, porównywalnego wariantu kwoty, umowy i podstawy netto/brutto; bez domyślnych przeliczeń.',
  }
}

export function matchingInput(
  profile: ProfileData,
  offer: SourceAdContent,
): MatchingInput {
  const criteria: Criterion[] = []
  const add = (group: Group, id: string, label: string, unknown = false) =>
    criteria.push({ id, group, label: scrubContacts(label), unknown })
  const skillNames = new Set(
    profile.skills.map((s) => s.name.toLocaleLowerCase()),
  )
  const skills = [
    ...new Map(
      offer.skills.map((s) => [s.name.toLocaleLowerCase(), s]),
    ).values(),
  ]
  for (const [i, s] of skills.entries())
    add(
      'technologies',
      `technology:${i}`,
      `${s.name}${s.optional === true ? ' (opcjonalna)' : ''}`,
      !skillNames.has(s.name.toLocaleLowerCase()),
    )
  if (!skills.length)
    add(
      'technologies',
      'technology:unknown',
      'Technologie oferty niepodane',
      true,
    )
  add(
    'experience',
    'experience:role',
    'Doświadczenie w roli',
    !profile.experience.length,
  )
  add(
    'experience',
    'experience:seniority',
    'Poziom doświadczenia',
    !profile.experience.length || !offer.seniority,
  )
  const checks: MatchingInput['checks'] = []
  for (const [key, v] of Object.entries(profile.expectations)) {
    if (v.state === 'no_preference') continue
    add(
      'conditions',
      `condition:${key}`,
      `${key}: ${v.value || 'niewiadoma'}`,
      v.state === 'unknown',
    )
    if (v.state === 'specified' && v.importance === 'required') {
      const mode = (s: string) =>
        ({
          remote: 'remote',
          zdalnie: 'remote',
          zdalna: 'remote',
          hybrid: 'hybrid',
          hybrydowo: 'hybrid',
          onsite: 'onsite',
          office: 'onsite',
          stacjonarnie: 'onsite',
        })[s.trim().toLowerCase() as 'remote']
      const wanted = key === 'workMode' ? mode(v.value) : undefined
      const mixed = key === 'workMode' && offer.mode === 'remote-hybrid'
      const actual =
        key === 'workMode'
          ? mixed && (wanted === 'remote' || wanted === 'hybrid')
            ? wanted
            : mode(offer.mode ?? '')
          : undefined
      checks.push({
        criterion: key,
        state:
          wanted && actual
            ? wanted === actual
              ? 'match'
              : 'conflict'
            : 'unknown',
        reason:
          wanted && actual
            ? `Wymagane: ${v.value}; ogłoszenie: ${offer.mode}${mixed ? '. Rozbieżne warianty zdalny/hybrydowy; pasujący wariant spełnia kryterium.' : ''}`
            : 'Wymaganie tekstowe wymaga sprawdzenia; brak jednoznacznego porównania.',
      })
    }
  }
  if (profile.salary.state !== 'no_preference') {
    add(
      'conditions',
      'condition:salary',
      'Oczekiwane wynagrodzenie',
      profile.salary.state === 'unknown' ||
        salaryCheck(profile.salary, offer.salaries).state === 'unknown',
    )
    if (
      profile.salary.state === 'specified' &&
      profile.salary.importance === 'required'
    )
      checks.push(salaryCheck(profile.salary, offer.salaries))
  }
  if (profile.exclusions.trim())
    checks.push({
      criterion: 'exclusions',
      state: 'unknown',
      reason: 'Wykluczenia zapisane tekstowo wymagają sprawdzenia.',
    })
  for (const [key, v] of Object.entries(profile.goals))
    add('direction', `direction:${key}`, key, !v.trim())
  const facts = {
    summary: profile.summary,
    skills: profile.skills.map(({ id: _id, source: _source, ...s }) => s),
    experience: profile.experience.map(
      ({ id: _id, source: _source, ...e }) => e,
    ),
    goals: profile.goals,
    expectations: profile.expectations,
    salary: profile.salary,
    exclusions: profile.exclusions,
  }
  return {
    profile: scrubContacts(JSON.stringify(facts, null, 2)),
    offer: scrubContacts(
      JSON.stringify(
        {
          title: offer.title,
          company: offer.company,
          description: offer.description,
          skills: offer.skills,
          salaries: offer.salaries,
          locations: offer.locations,
          seniority: offer.seniority,
          hours: offer.hours,
          mode: offer.mode,
        },
        null,
        2,
      ),
    ),
    criteria,
    checks: checks.map((c) => ({ ...c, reason: scrubContacts(c.reason) })),
  }
}
