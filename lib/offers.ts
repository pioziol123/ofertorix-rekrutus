import { matchingPending, type MatchingSummary } from './matching/view.ts'
import {
  assessRemoteEligibility,
  type RemoteEligibility,
} from './sources/remote-eligibility.ts'
import type { Pool } from 'pg'
import { polishCatalog, type PolishSource } from './sources/polish-catalog.ts'
import { jobspyCatalog, type JobspySource } from './sources/jobspy-catalog.ts'

export type Salary = {
  from: number | null
  to: number | null
  currency: string | null
  period: string | null
  contract: string | null
  basis?: string | null
  origin?: 'employer' | 'portal_estimate' | 'unknown'
}
export type OfferView = {
  id: string
  title: string
  company: string
  url: string | null
  description: string
  skills: { name: string; optional: boolean | null }[]
  salaries: Salary[]
  locations: string[]
  seniority: string | null
  hours: string | null
  mode: string | null
  firstSeen: string
  lastSeen: string
  published: string | null
  validTo: string | null
  availability: string
  expired: boolean
  revisions: { id: string; at: string }[]
  source?: string
  qualificationUnknown?: string[]
  remoteEligibility?: RemoteEligibility
  assessment?: MatchingSummary
}
export type Filters = {
  q: string
  technology: string
  technologyMode: 'any' | 'all' | 'excluded'
  skillType: 'all' | 'required' | 'optional'
  location: string
  mode: string
  contract: string
  hours: string
  seniority: string
  availability: string
  minSalary: number | null
  currency: string
  period: string
  includeUnknownSalary: boolean
  assessmentState:
    | ''
    | 'unassessed'
    | 'pending'
    | 'current'
    | 'stale'
    | 'failed'
    | 'excluded'
    | 'unknown'
  minRating: number | null
  minCompleteness: number | null
  minTechnologies: number | null
  minExperience: number | null
  minConditions: number | null
  minDirection: number | null
  sort: 'newest' | 'oldest' | 'published' | 'title' | 'company' | 'rating'
  page: number
}
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(text).filter((s): s is string => s !== null) : []
const date = (v: unknown): string | null =>
  (typeof v === 'string' || v instanceof Date) &&
  Number.isFinite(new Date(v).getTime())
    ? new Date(v).toISOString()
    : null
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const url = new URL(v)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
export function plainDescription(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/(p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({
          '&nbsp;': ' ',
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&#39;': "'",
        })[entity]!,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
export function projectOffer(
  row: Record<string, unknown>,
  now = new Date(),
): OfferView {
  const p =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Record<string, unknown>)
      : {}
  const salaries: Salary[] = []
  for (const value of Array.isArray(p.salaries)
    ? p.salaries
    : [p.salary, p.secondarySalary]) {
    if (value && typeof value === 'object') {
      const s = value as Record<string, unknown>
      salaries.push({
        from: number(s.from),
        to: number(s.to),
        currency: text(s.currency),
        period: text(s.period),
        contract: text(s.employmentType),
        ...(text(s.basis) ? { basis: text(s.basis) } : {}),
        ...(['employer', 'portal_estimate', 'unknown'].includes(
          String(s.origin),
        )
          ? { origin: s.origin as Salary['origin'] }
          : {}),
      })
    }
  }
  const skills = Array.isArray(p.skills)
    ? p.skills.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const skill = value as Record<string, unknown>
        const name = text(skill.name)
        return name
          ? [
              {
                name,
                optional:
                  typeof skill.optional === 'boolean'
                    ? skill.optional
                    : skill.level === 'NiceToHave'
                      ? true
                      : ['Basic', 'Advanced', 'Expert'].includes(
                            String(skill.level),
                          )
                        ? false
                        : null,
              },
            ]
          : []
      })
    : []
  const validTo = date(row.valid_to)
  return {
    id: String(row.id),
    title: text(p.title) ?? 'Stanowisko bez nazwy',
    company: text(p.company) ?? 'Firma niepodana',
    url: safeUrl(row.url),
    description: plainDescription(p.description),
    salaries,
    skills,
    locations: strings(p.locations),
    seniority: text(p.experienceLevel),
    hours: text(p.contractTime),
    mode:
      p.isRemote === true && p.isHybrid === true
        ? 'remote-hybrid'
        : p.isRemote === true
          ? 'remote'
          : p.isHybrid === true
            ? 'hybrid'
            : p.isRemote === false && p.isHybrid === false
              ? 'office'
              : null,
    firstSeen: date(row.first_seen_at)!,
    lastSeen: date(row.last_seen_at)!,
    published: date(p.validFrom),
    validTo,
    availability:
      row.availability === 'unavailable' ? 'unavailable' : 'available',
    expired: validTo !== null && new Date(validTo) < now,
    revisions: Array.isArray(row.revisions)
      ? (row.revisions as OfferView['revisions'])
      : [],
    ...(typeof row.source === 'string' &&
    (Object.hasOwn(jobspyCatalog, row.source) ||
      Object.hasOwn(polishCatalog, row.source) ||
      row.source === 'himalayas')
      ? {
          source:
            row.source === 'himalayas'
              ? 'Himalayas'
              : Object.hasOwn(polishCatalog, row.source)
                ? polishCatalog[row.source as PolishSource].name
                : jobspyCatalog[row.source as JobspySource].name,
          qualificationUnknown: strings(p.qualificationUnknown),
          remoteEligibility: assessRemoteEligibility(
            p.sourceRecord && typeof p.sourceRecord === 'object'
              ? (p.sourceRecord as Record<string, unknown>)
              : {
                  title: p.title,
                  description: p.description,
                  is_remote: p.isRemote,
                },
          ),
        }
      : {}),
  }
}

export function parseFilters(query: Record<string, unknown>): Filters {
  const get = (key: string, fallback = '') => {
    const value = query[key]
    if (value === undefined) return fallback
    if (typeof value !== 'string' || value.length > 200)
      throw new Error(`Invalid ${key}`)
    return value.trim()
  }
  function choice<T extends string>(
    key: string,
    options: readonly T[],
    fallback: T,
  ): T {
    const value = get(key, fallback)
    if (!options.includes(value as T)) throw new Error(`Invalid ${key}`)
    return value as T
  }
  const percentage = (key: string) => {
    const value = get(key)
    if (!value) return null
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > 100)
      throw new Error(`Invalid ${key}`)
    return Number(value)
  }
  const min = get('minSalary')
  const minSalary = min ? Number(min) : null
  if (
    minSalary !== null &&
    (!/^\d+(\.\d{1,2})?$/.test(min) ||
      !Number.isFinite(minSalary) ||
      minSalary > 1e9)
  )
    throw new Error('Invalid minSalary')
  const page = get('page', '1')
  if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 1e6)
    throw new Error('Invalid page')
  const currency = get('currency')
  const period = get('period')
  if (minSalary !== null && (!currency || !period))
    throw new Error('Minimum salary needs currency and period')
  return {
    q: get('q'),
    technology: get('technology'),
    technologyMode: choice('technologyMode', ['any', 'all', 'excluded'], 'any'),
    skillType: choice('skillType', ['all', 'required', 'optional'], 'all'),
    location: get('location'),
    mode: choice('mode', ['', 'remote', 'hybrid', 'office', 'unknown'], ''),
    contract: get('contract'),
    hours: get('hours'),
    seniority: get('seniority'),
    availability: choice(
      'availability',
      ['', 'available', 'unavailable', 'expired'],
      '',
    ),
    assessmentState: choice(
      'assessmentState',
      [
        '',
        'unassessed',
        'pending',
        'current',
        'stale',
        'failed',
        'excluded',
        'unknown',
      ],
      '',
    ),
    minRating: percentage('minRating'),
    minCompleteness: percentage('minCompleteness'),
    minTechnologies: percentage('minTechnologies'),
    minExperience: percentage('minExperience'),
    minConditions: percentage('minConditions'),
    minDirection: percentage('minDirection'),
    minSalary,
    currency,
    period,
    includeUnknownSalary:
      choice('includeUnknownSalary', ['true', 'false'], 'true') === 'true',
    sort: choice(
      'sort',
      ['newest', 'oldest', 'published', 'title', 'company', 'rating'],
      'newest',
    ),
    page: Number(page),
  }
}
const lower = (v: string) => v.toLocaleLowerCase('pl')
export function salaryMatch(
  offer: OfferView,
  f: Filters,
): { matches: boolean; partial: boolean; unknown: boolean } {
  const variants = offer.salaries.filter(
    (s) =>
      (!f.contract || s.contract === f.contract) &&
      (!f.currency || s.currency === f.currency || s.currency === null) &&
      (!f.period || s.period === f.period || s.period === null),
  )
  if (!variants.length)
    return {
      matches:
        offer.salaries.length === 0 && f.includeUnknownSalary && !f.contract,
      partial: false,
      unknown: true,
    }
  let partial = false,
    unknown = false,
    matches = false
  for (const s of variants) {
    const uncertain =
      s.origin === 'portal_estimate' ||
      s.origin === 'unknown' ||
      s.currency === null ||
      s.period === null ||
      (s.from === null && s.to === null)
    if (uncertain) {
      unknown = true
      if (f.includeUnknownSalary) matches = true
      continue
    }
    if (f.minSalary === null) {
      matches = true
      continue
    }
    if (s.to !== null && s.to < f.minSalary) continue
    if (s.from !== null && s.from >= f.minSalary) {
      matches = true
      continue
    }
    if (s.to !== null) {
      matches = true
      partial = true
      continue
    }
    unknown = true
    if (f.includeUnknownSalary) matches = true
  }
  return { matches, partial, unknown }
}
export function filterOffers(offers: OfferView[], f: Filters) {
  const wanted = f.technology
    .split(',')
    .map((s) => lower(s.trim()))
    .filter(Boolean)
  const matches = offers.filter((o) => {
    const a = o.assessment
    if (f.assessmentState) {
      if (f.assessmentState === 'unassessed' && a) return false
      if (
        f.assessmentState === 'pending' &&
        !matchingPending.some((s) => s === a?.state)
      )
        return false
      if (f.assessmentState === 'current' && (!a?.scoreId || a.stale))
        return false
      if (f.assessmentState === 'stale' && (!a?.scoreId || !a.stale))
        return false
      if (
        ['failed', 'excluded', 'unknown'].includes(f.assessmentState) &&
        a?.state !== f.assessmentState
      )
        return false
    }
    const limits = [
      [f.minRating, a?.rating],
      [f.minCompleteness, a?.completeness],
      [f.minTechnologies, a?.components.technologies],
      [f.minExperience, a?.components.experience],
      [f.minConditions, a?.components.conditions],
      [f.minDirection, a?.components.direction],
    ] as const
    if (
      limits.some(
        ([limit, value]) =>
          limit !== null &&
          (!a?.scoreId ||
            (a.stale && f.assessmentState !== 'stale') ||
            value === null ||
            value === undefined ||
            value < limit),
      )
    )
      return false

    if (
      f.q &&
      !lower(
        [o.title, o.company, ...o.skills.map((s) => s.name)].join(' '),
      ).includes(lower(f.q))
    )
      return false
    const skills = o.skills
      .filter(
        (s) =>
          f.skillType === 'all' || s.optional === (f.skillType === 'optional'),
      )
      .map((s) => lower(s.name))
    if (wanted.length) {
      const checks = wanted.map((t) => skills.includes(t))
      if (f.technologyMode === 'any' && !checks.some(Boolean)) return false
      if (f.technologyMode === 'all' && !checks.every(Boolean)) return false
      if (f.technologyMode === 'excluded' && checks.some(Boolean)) return false
    }
    if (
      f.location &&
      !o.locations.some((l) => lower(l).includes(lower(f.location)))
    )
      return false
    if (
      f.mode &&
      (f.mode === 'unknown'
        ? o.mode !== null
        : o.mode !== f.mode &&
          !(
            o.mode === 'remote-hybrid' && ['remote', 'hybrid'].includes(f.mode)
          ))
    )
      return false
    if (
      (f.hours && o.hours !== f.hours) ||
      (f.seniority && o.seniority !== f.seniority)
    )
      return false
    if (
      f.availability &&
      (f.availability === 'expired'
        ? !o.expired
        : o.availability !== f.availability)
    )
      return false
    if (
      (f.minSalary !== null ||
        f.currency ||
        f.period ||
        f.contract ||
        !f.includeUnknownSalary) &&
      !salaryMatch(o, f).matches
    )
      return false
    return true
  })
  matches.sort((a, b) => {
    let result = 0
    if (f.sort === 'rating') {
      const current = (o: OfferView) =>
        o.assessment?.scoreId &&
        !o.assessment.stale &&
        o.assessment.rating !== null
          ? o.assessment.rating
          : null
      const av = current(a),
        bv = current(b)
      result = av === null ? (bv === null ? 0 : 1) : bv === null ? -1 : bv - av
    }
    if (f.sort === 'title' || f.sort === 'company')
      result = a[f.sort].localeCompare(b[f.sort], 'pl')
    if (f.sort === 'newest' || f.sort === 'oldest')
      result =
        a.firstSeen.localeCompare(b.firstSeen) * (f.sort === 'newest' ? -1 : 1)
    if (f.sort === 'published')
      result = (b.published ?? '').localeCompare(a.published ?? '')
    return result || a.id.localeCompare(b.id)
  })
  const total = matches.length
  const page = Math.min(f.page, Math.max(1, Math.ceil(total / 20)))
  const values = (fn: (o: OfferView) => (string | null)[]) =>
    [...new Set(offers.flatMap(fn).filter((s): s is string => !!s))].sort(
      (a, b) => a.localeCompare(b, 'pl'),
    )
  return {
    items: matches.slice((page - 1) * 20, page * 20).map((o) => ({
      ...o,
      description: undefined,
      revisions: undefined,
      salaryStatus: salaryMatch(o, f),
    })),
    total,
    page,
    pageSize: 20,
    filters: f,
    options: {
      technologies: values((o) => o.skills.map((s) => s.name)),
      contracts: values((o) => o.salaries.map((s) => s.contract)),
      currencies: values((o) => o.salaries.map((s) => s.currency)),
      periods: values((o) => o.salaries.map((s) => s.period)),
      hours: values((o) => [o.hours]),
      seniorities: values((o) => [o.seniority]),
    },
  }
}
export async function readOffers(pool: Pool): Promise<OfferView[]> {
  const result = await pool.query(
    `SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id LIMIT 10001`,
  )
  if (result.rows.length > 10000)
    throw new Error('Offer catalog exceeds current reader limit')
  return result.rows.map((row) => projectOffer(row))
}
export async function readOffer(
  pool: Pool,
  id: string,
): Promise<OfferView | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null
  const result = await pool.query(
    `SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id WHERE a.id=$1`,
    [id],
  )
  if (!result.rows[0]) return null
  const revisions = await pool.query(
    `SELECT id,retrieved_at AS at FROM source_ad_revisions WHERE source_ad_id=$1 ORDER BY retrieved_at DESC,id DESC`,
    [id],
  )
  return projectOffer({ ...result.rows[0], revisions: revisions.rows })
}

// Form drafts may keep salary values while that optional filter is switched off.
export function offerFilterQuery(
  form: Record<string, string | number>,
  salaryEnabled: boolean,
): Record<string, string> {
  const salaryKeys = new Set([
    'minSalary',
    'currency',
    'period',
    'includeUnknownSalary',
  ])
  return Object.fromEntries(
    Object.entries(form)
      .filter(
        ([key, value]) =>
          String(value).trim() !== '' &&
          (salaryEnabled || !salaryKeys.has(key)),
      )
      .map(([key, value]) => [key, String(value).trim()]),
  )
}
export function hasSalaryFilter(query: Record<string, unknown>): boolean {
  return (
    ['minSalary', 'currency', 'period'].some(
      (key) => typeof query[key] === 'string' && query[key].trim() !== '',
    ) || query.includeUnknownSalary === 'false'
  )
}
