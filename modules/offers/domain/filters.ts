import { readStageFilter, type StageFilterValue } from './stage-filter.ts'

/** Filters, sort order and page of the offer list. */
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
    '' | 'unassessed' | 'pending' | 'current' | 'stale' | 'failed' | 'excluded'
  minRating: number | null
  minCompleteness: number | null
  minTechnologies: number | null
  minExperience: number | null
  minConditions: number | null
  minDirection: number | null
  /** The chosen stages of applications; empty: every offer (lq3 T3-R03). */
  stages: StageFilterValue[]
  sort: 'newest' | 'oldest' | 'published' | 'title' | 'company' | 'rating'
  page: number
}

/**
 * Validates the list query and fills in defaults. Throws an error for any
 * value outside the accepted shape, except the key `stage`, which takes
 * several values, repeated or comma-separated, and leaves out unknown ones
 * (lq3 T3-R05).
 */
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
      ['', 'unassessed', 'pending', 'current', 'stale', 'failed', 'excluded'],
      '',
    ),
    minRating: percentage('minRating'),
    minCompleteness: percentage('minCompleteness'),
    minTechnologies: percentage('minTechnologies'),
    minExperience: percentage('minExperience'),
    minConditions: percentage('minConditions'),
    minDirection: percentage('minDirection'),
    stages: readStageFilter(query.stage),
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
