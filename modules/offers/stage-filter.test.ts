import { describe, expect, it } from 'vitest'
import { filterOffers } from './domain/filter-offers.ts'
import { parseFilters } from './domain/filters.ts'
import {
  listStageIcon,
  offerFilterQuery,
  readStageFilter,
  stageFilterOptions,
  type StageFilterValue,
} from './view.ts'
// Fixtures are ads in the unified form of the Sources read, translated from
// source content the way the read translates it.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { projectSourceAd } from '../sources/domain/ad-projection.ts'
import type { OfferView } from './offer-view.ts'
import {
  stageMarks,
  stages,
  type Stage,
} from '../recruitments/view.ts'

/**
 * The stage of applications on the offer list (task oferty-pracy-lq3.3, T3
 * of epic lq3): the icon choice (T3-AC01), the filter "Etap aplikacji"
 * (T3-AC02), its combination with the other filters and the paging
 * (T3-AC03), and its address (T3-AC04).
 */

const offer = (
  id: string,
  stage?: Stage,
  payload: Record<string, unknown> = {},
): OfferView => ({
  ...projectSourceAd({
    id,
    payload: { title: `Offer ${id}`, ...payload },
    first_seen_at: '2026-10-01T10:00:00Z',
    last_seen_at: '2026-10-02T10:00:00Z',
  }),
  revisions: [],
  ...(stage ? { stage } : {}),
})

/** One offer without an application and one in each stage. */
const catalogue = [
  offer('none'),
  offer('to_consider', 'to_consider'),
  offer('cv_sent', 'cv_sent'),
  offer('rejected', 'rejected'),
  offer('removed', 'removed'),
]
const listed = (stage: unknown, offers = catalogue) =>
  filterOffers(offers, parseFilters(stage === undefined ? {} : { stage }))
    .items.map((o) => o.id)
    .sort()

describe('the stage icon on the offer list (T3-R01, T3-AC01)', () => {
  it('shows the icon of "Do rozważenia", "CV wysłane" and "Odrzucone" with its label', () => {
    expect(listStageIcon('to_consider')).toEqual({
      stage: 'to_consider',
      label: 'Do rozważenia',
      paths: stageMarks.to_consider.paths,
      colour: stageMarks.to_consider.colour,
    })
    expect(listStageIcon('cv_sent')).toMatchObject({
      stage: 'cv_sent',
      label: 'CV wysłane',
      paths: stageMarks.cv_sent.paths,
    })
    expect(listStageIcon('rejected')).toMatchObject({
      stage: 'rejected',
      label: 'Odrzucone',
      paths: stageMarks.rejected.paths,
    })
  })

  it('shows no icon for an offer without an application and one in "Zdjęta z listy"', () => {
    expect(listStageIcon(undefined)).toBeNull()
    expect(listStageIcon('removed')).toBeNull()
  })
})

describe('the stage filter of the offer list (T3-R03, T3-AC02)', () => {
  it('offers "Bez aplikacji" and the four stages by their labels (A-AC11)', () => {
    expect(stageFilterOptions).toEqual([
      { value: 'none', label: 'Bez aplikacji' },
      { value: 'to_consider', label: 'Do rozważenia' },
      { value: 'cv_sent', label: 'CV wysłane' },
      { value: 'rejected', label: 'Odrzucone' },
      { value: 'removed', label: 'Zdjęta z listy' },
    ])
  })

  it('lists exactly the offers of each single choice', () => {
    for (const value of ['none', ...stages] as StageFilterValue[])
      expect(listed(value), value).toEqual([value])
  })

  it('leaves an offer in "Zdjęta z listy" out of "Bez aplikacji"', () => {
    expect(listed('none')).not.toContain('removed')
  })

  it('lists the offers of either of two choices, repeated or comma-separated', () => {
    expect(listed(['cv_sent', 'none'])).toEqual(['cv_sent', 'none'])
    expect(listed('removed,to_consider')).toEqual(['removed', 'to_consider'])
  })

  it('lists every offer when nothing is chosen', () => {
    expect(listed(undefined)).toEqual(catalogue.map((o) => o.id).sort())
    expect(listed('')).toEqual(catalogue.map((o) => o.id).sort())
  })

  it('carries each offer’s stage on the list item', () => {
    const items = filterOffers(catalogue, parseFilters({})).items
    expect(items.find((o) => o.id === 'cv_sent')?.stage).toBe('cv_sent')
    expect(items.find((o) => o.id === 'none')?.stage).toBeUndefined()
  })
})

describe('the stage filter with the other filters (T3-R04, T3-AC03)', () => {
  it('shows only the offers meeting both the stage filter and another filter', () => {
    const offers = [
      offer('php-saved', 'to_consider', { company: 'Acme' }),
      offer('php-none', undefined, { company: 'Acme' }),
      offer('java-saved', 'to_consider', { company: 'Other' }),
    ]
    const list = filterOffers(
      offers,
      parseFilters({ stage: 'to_consider', q: 'acme' }),
    )
    expect(list.items.map((o) => o.id)).toEqual(['php-saved'])
    expect(list.total).toBe(1)
  })

  it('counts and pages the filtered list', () => {
    // 45 offers: 25 in "CV wysłane", 20 without an application.
    const offers = Array.from({ length: 45 }, (_, i) =>
      offer(`o${String(i).padStart(2, '0')}`, i < 25 ? 'cv_sent' : undefined),
    )
    const all = filterOffers(offers, parseFilters({ page: '3' }))
    expect(all).toMatchObject({ total: 45, page: 3 })
    expect(all.items).toHaveLength(5)
    // Two pages of 20 for 25 offers: page 3 is beyond the last, so page 2.
    const sent = filterOffers(
      offers,
      parseFilters({ stage: 'cv_sent', page: '3' }),
    )
    expect(sent).toMatchObject({ total: 25, page: 2 })
    expect(sent.items).toHaveLength(5)
    expect(sent.items.every((o) => o.stage === 'cv_sent')).toBe(true)
  })

  it('leaves the page out of the address when the stage filter changes, so the list shows page 1', () => {
    // The form holds the other filters; the page is never one of its keys.
    const address = offerFilterQuery(
      { q: 'php', sort: 'newest', stage: ['none', 'rejected'] },
      false,
    )
    expect(address).toEqual({ q: 'php', sort: 'newest', stage: 'none,rejected' })
    expect(parseFilters(address)).toMatchObject({
      page: 1,
      stages: ['none', 'rejected'],
    })
    expect(offerFilterQuery({ q: 'php', stage: [] }, false)).toEqual({
      q: 'php',
    })
  })
})

describe('the stage filter in the list’s address (T3-R05, T3-AC04)', () => {
  it('reads two stages and an unknown one as the two stages, without an error', () => {
    expect(readStageFilter(['cv_sent', 'archived', 'none'])).toEqual([
      'none',
      'cv_sent',
    ])
    expect(readStageFilter('cv_sent,archived,none')).toEqual([
      'none',
      'cv_sent',
    ])
    expect(
      parseFilters({ stage: ['rejected', 'nowhere', 'to_consider'] }).stages,
    ).toEqual(['to_consider', 'rejected'])
  })

  it('reads nothing chosen from a missing, empty or unknown key', () => {
    expect(readStageFilter(undefined)).toEqual([])
    expect(readStageFilter('')).toEqual([])
    expect(readStageFilter(['lost', 42])).toEqual([])
    expect(parseFilters({}).stages).toEqual([])
  })
})
