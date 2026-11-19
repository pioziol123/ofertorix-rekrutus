import { describe, expect, it } from 'vitest'
import { filterOffers } from './domain/filter-offers.ts'
import { hasSalaryFilter, offerFilterQuery } from './view.ts'
import { parseFilters } from './domain/filters.ts'
import { salaryMatch } from './domain/salary-match.ts'
// Fixtures are ads in the unified form of the Sources read, translated from
// source content the way the read translates it.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { projectSourceAd } from '../sources/domain/ad-projection.ts'
import type { OfferView } from './offer-view.ts'

const row = (payload: Record<string, unknown> = {}, id = 'a') => ({
  id,
  payload,
  first_seen_at: '2026-10-01T10:00:00Z',
  last_seen_at: '2026-10-02T10:00:00Z',
})
const offer = (payload: Record<string, unknown> = {}, id = 'a'): OfferView => ({
  ...projectSourceAd(row(payload, id)),
  revisions: [],
})

describe('offer list query and matching', () => {
  it('applies other filters without salary constraints when the salary filter is switched off', () => {
    const query = offerFilterQuery(
      {
        technology: 'Docker',
        location: 'Warszawa',
        contract: 'B2B',
        minSalary: '25000',
        currency: 'PLN',
        period: 'Month',
        includeUnknownSalary: 'false',
      },
      false,
    )
    expect(query).toEqual({
      technology: 'Docker',
      location: 'Warszawa',
      contract: 'B2B',
    })
    expect(parseFilters(query)).toMatchObject({
      technology: 'Docker',
      location: 'Warszawa',
      contract: 'B2B',
      minSalary: null,
      currency: '',
      period: '',
      includeUnknownSalary: true,
    })
  })
  it.each([25000, 0])(
    'preserves an enabled salary filter with minimum %s',
    (minSalary) => {
      const query = offerFilterQuery(
        {
          minSalary,
          currency: 'PLN',
          period: 'Month',
          includeUnknownSalary: 'false',
        },
        true,
      )
      expect(query).toEqual({
        minSalary: String(minSalary),
        currency: 'PLN',
        period: 'Month',
        includeUnknownSalary: 'false',
      })
      expect(parseFilters(query)).toMatchObject({
        minSalary,
        currency: 'PLN',
        period: 'Month',
        includeUnknownSalary: false,
      })
    },
  )
  it.each([
    {},
    { includeUnknownSalary: 'true' },
    { technology: 'Docker', includeUnknownSalary: 'true' },
    { minSalary: '', currency: '', period: '' },
  ])(
    'does not activate salary filtering for a default or legacy URL %j',
    (query) => {
      expect(hasSalaryFilter(query)).toBe(false)
    },
  )
  it.each([
    { minSalary: '25000', currency: 'PLN', period: 'Month' },
    { minSalary: '0', currency: 'PLN', period: 'Month' },
    { currency: 'PLN' },
    { period: 'Month' },
    { includeUnknownSalary: 'false' },
  ])('restores an active salary filter from URL %j', (query) => {
    expect(hasSalaryFilter(query)).toBe(true)
  })
  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: ['1', '2'] },
    { sort: 'sql' },
    { minSalary: '-1' },
    { minSalary: '25000' },
    { technologyMode: 'maybe' },
    { q: 'x'.repeat(201) },
  ])('rejects malformed query %j', (query) =>
    expect(() => parseFilters(query)).toThrow(),
  )
  it('matches a partial salary overlap and reports it explicitly', () => {
    const result = salaryMatch(
      offer({
        salary: {
          from: 20000,
          to: 28000,
          currency: 'PLN',
          period: 'Month',
          employmentType: 'B2B',
        },
      }),
      parseFilters({
        minSalary: '25000',
        currency: 'PLN',
        period: 'Month',
        contract: 'B2B',
      }),
    )
    expect(result).toEqual({ matches: true, partial: true, unknown: false })
  })
  it('uses a compatible secondary salary without mixing currencies or contracts', () => {
    const value = offer({
      salary: {
        from: 50000,
        to: 60000,
        currency: 'EUR',
        period: 'Month',
        employmentType: 'Employment',
      },
      secondarySalary: {
        from: 25000,
        to: 30000,
        currency: 'PLN',
        period: 'Month',
        employmentType: 'B2B',
      },
    })
    expect(
      salaryMatch(
        value,
        parseFilters({
          minSalary: '25000',
          currency: 'PLN',
          period: 'Month',
          contract: 'B2B',
        }),
      ).matches,
    ).toBe(true)
    expect(
      salaryMatch(
        value,
        parseFilters({
          minSalary: '35000',
          currency: 'PLN',
          period: 'Month',
          contract: 'B2B',
        }),
      ).matches,
    ).toBe(false)
    expect(
      salaryMatch(
        value,
        parseFilters({ minSalary: '25000', currency: 'PLN', period: 'Hour' }),
      ).matches,
    ).toBe(false)
  })
  it('keeps unknown salary by default and allows explicitly excluding it', () => {
    const value = offer()
    expect(
      salaryMatch(
        value,
        parseFilters({ minSalary: '25000', currency: 'PLN', period: 'Month' }),
      ),
    ).toEqual({ matches: true, partial: false, unknown: true })
    expect(
      salaryMatch(
        value,
        parseFilters({
          minSalary: '25000',
          currency: 'PLN',
          period: 'Month',
          includeUnknownSalary: 'false',
        }),
      ).matches,
    ).toBe(false)
  })
  it('applies any, all, exclusions and required/optional skill selectors', () => {
    const values = [
      offer(
        { skills: [{ name: 'PHP' }, { name: 'Redis', level: 'NiceToHave' }] },
        'a',
      ),
      offer({ skills: [{ name: 'PHP' }] }, 'b'),
    ]
    const ids = (query: Record<string, string>) =>
      filterOffers(values, parseFilters(query)).items.map((o) => o.id)
    expect(ids({ technology: 'php,redis', technologyMode: 'all' })).toEqual([
      'a',
    ])
    expect(ids({ technology: 'redis,vue', technologyMode: 'any' })).toEqual([
      'a',
    ])
    expect(ids({ technology: 'redis', technologyMode: 'excluded' })).toEqual([
      'b',
    ])
    expect(ids({ technology: 'redis', skillType: 'required' })).toEqual([])
    expect(ids({ technology: 'redis', skillType: 'optional' })).toEqual(['a'])
  })
  it('sorts ties deterministically before pagination without mutating caller order', () => {
    const values = Array.from({ length: 25 }, (_, i) =>
      offer({ title: 'PHP' }, String(24 - i).padStart(2, '0')),
    )
    const result = filterOffers(
      values,
      parseFilters({ page: '2', sort: 'title' }),
    )
    expect(result).toMatchObject({ total: 25, page: 2, pageSize: 20 })
    expect(result.items.map((o) => o.id)).toEqual([
      '20',
      '21',
      '22',
      '23',
      '24',
    ])
    expect(values[0]!.id).toBe('24')
    expect(result.items[0]!.description).toBeUndefined()
  })
  it('clamps the requested page after filtering and combines condition filters', () => {
    const values = [
      offer({
        title: 'Senior PHP',
        company: 'Acme',
        locations: ['Warszawa'],
        isRemote: true,
        contractTime: 'FullTime',
        experienceLevel: 'Senior',
      }),
    ]
    expect(
      filterOffers(
        values,
        parseFilters({
          q: 'acme',
          location: 'warsz',
          mode: 'remote',
          hours: 'FullTime',
          seniority: 'Senior',
          page: '99',
        }),
      ),
    ).toMatchObject({ total: 1, page: 1 })
  })
})

describe('unknown and conflicting source fields', () => {
  it('does not invent a required skill level from an unknown enum', () => {
    const value = offer({
      skills: [{ name: 'FutureTech', level: 'FutureLevel' }],
    })
    expect(value.skills[0]!.optional).toBeNull()
    expect(
      filterOffers(
        [value],
        parseFilters({ technology: 'FutureTech', skillType: 'required' }),
      ).total,
    ).toBe(0)
    expect(
      filterOffers([value], parseFilters({ technology: 'FutureTech' })).total,
    ).toBe(1)
  })
  it('keeps both contradictory work modes available for explicit filtering', () => {
    const value = offer({ isRemote: true, isHybrid: true })
    expect(value.mode).toBe('remote-hybrid')
    expect(filterOffers([value], parseFilters({ mode: 'remote' })).total).toBe(
      1,
    )
    expect(filterOffers([value], parseFilters({ mode: 'hybrid' })).total).toBe(
      1,
    )
    expect(filterOffers([value], parseFilters({ mode: 'office' })).total).toBe(
      0,
    )
  })
})

describe('matching ratings in the offer list', () => {
  const assessed = (
    id: string,
    rating: number | null,
    patch: Partial<NonNullable<ReturnType<typeof offer>['assessment']>> = {},
  ) => ({
    ...offer({}, id),
    assessment: {
      requestId: `request-${id}`,
      state: 'completed',
      scoreId: `score-${id}`,
      rating,
      completeness: 75,
      stale: false,
      components: {
        technologies: 80,
        experience: 60,
        conditions: null,
        direction: 0,
      },
      ...patch,
    },
  })
  const ids = (
    values: ReturnType<typeof offer>[],
    query: Record<string, string>,
  ) => filterOffers(values, parseFilters(query)).items.map((item) => item.id)

  it.each([
    'minRating',
    'minCompleteness',
    'minTechnologies',
    'minExperience',
    'minConditions',
    'minDirection',
  ])('accepts percentage boundaries and rejects malformed %s', (key) => {
    expect(parseFilters({ [key]: '0' })[key as 'minRating']).toBe(0)
    expect(parseFilters({ [key]: '100' })[key as 'minRating']).toBe(100)
    expect(parseFilters({ [key]: '75.25' })[key as 'minRating']).toBe(75.25)
    for (const value of ['-1', '100.01', 'NaN', '1e2', '1.001']) {
      expect(() => parseFilters({ [key]: value })).toThrow()
    }
    expect(() => parseFilters({ [key]: ['1', '2'] })).toThrow()
  })
  it('preserves rating zero while excluding unknown and outdated scores from thresholds', () => {
    const values = [
      offer({}, 'unassessed'),
      assessed('unknown', null),
      assessed('zero', 0),
      assessed('stale', 99, { stale: true }),
    ]
    expect(ids(values, { minRating: '0' })).toEqual(['zero'])
    expect(ids(values, { minRating: '0', assessmentState: 'stale' })).toEqual([
      'stale',
    ])
    expect(ids(values, { minRating: '1' })).toEqual([])
  })
  it('checks completeness and each component independently without turning unknown into zero', () => {
    const values = [assessed('a', 90)]
    expect(
      ids(values, {
        minCompleteness: '75',
        minTechnologies: '80',
        minExperience: '60',
        minDirection: '0',
      }),
    ).toEqual(['a'])
    for (const [key, threshold] of Object.entries({
      minCompleteness: '76',
      minTechnologies: '81',
      minExperience: '61',
      minDirection: '1',
      minConditions: '0',
    })) {
      expect(ids(values, { [key]: threshold })).toEqual([])
    }
  })
  it('filters latest request state independently of a retained successful rating', () => {
    const values = [
      offer({}, 'none'),
      assessed('pending', 80, { state: 'running' }),
      assessed('failed', 80, { state: 'failed' }),
      assessed('excluded', null, { state: 'excluded', scoreId: null }),
      assessed('unknown', null, { state: 'unknown', scoreId: null }),
      assessed('stale', 80, { stale: true }),
    ]
    expect(ids(values, { assessmentState: 'unassessed' })).toEqual(['none'])
    expect(ids(values, { assessmentState: 'pending' })).toEqual(['pending'])
    expect(ids(values, { assessmentState: 'current' })).toEqual([
      'failed',
      'pending',
    ])
    for (const state of ['failed', 'excluded', 'unknown', 'stale']) {
      expect(ids(values, { assessmentState: state })).toEqual([state])
    }
    expect(ids(values, { assessmentState: 'failed', minRating: '80' })).toEqual(
      ['failed'],
    )
    expect(() => parseFilters({ assessmentState: 'completed' })).toThrow()
  })
  it('sorts current ratings descending, places stale and unknown last, and uses stable ID ties', () => {
    const values = [
      assessed('z-stale', 100, { stale: true }),
      assessed('c-zero', 0),
      assessed('b-high', 90),
      assessed('a-high', 90),
      offer({}, 'x-none'),
      assessed('y-null', null),
    ]
    expect(ids(values, { sort: 'rating' })).toEqual([
      'a-high',
      'b-high',
      'c-zero',
      'x-none',
      'y-null',
      'z-stale',
    ])
    expect(values[0]!.id).toBe('z-stale')
  })
  it('retains rating criteria when the independent salary filter is disabled', () => {
    const query = offerFilterQuery(
      {
        minRating: 0,
        minConditions: 75,
        assessmentState: 'current',
        sort: 'rating',
        minSalary: 25000,
      },
      false,
    )
    expect(query).toEqual({
      minRating: '0',
      minConditions: '75',
      assessmentState: 'current',
      sort: 'rating',
    })
    expect(parseFilters(query)).toMatchObject({
      minRating: 0,
      minConditions: 75,
      sort: 'rating',
    })
  })
})
