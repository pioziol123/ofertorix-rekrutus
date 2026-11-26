import { describe, expect, it } from 'vitest'
import {
  changeFilters,
  changePageSize,
  choiceOnClose,
  clearFilters,
  filtersAtDefault,
  historyAddress,
  pageCount,
  readHistoryQuery,
  showPage,
  type SyncHistoryQuery,
} from './sync-history.ts'

const catalog = ['solid-jobs', 'himalayas', 'indeed', 'bulldogjob']
const defaults: SyncHistoryQuery = {
  sources: [],
  states: [],
  trigger: null,
  period: '7d',
  page: 1,
  size: 20,
}

describe('the history query read from the page address (T1-R08–R10, R17)', () => {
  it('gives the last 7 days, every source, state and way of starting, page 1 and 20 per page without an address', () => {
    expect(readHistoryQuery({}, catalog)).toEqual(defaults)
    expect(filtersAtDefault(readHistoryQuery({}, catalog))).toBe(true)
  })

  it('reads repeated and comma-separated sources and states, each once in catalogue order', () => {
    expect(
      readHistoryQuery(
        {
          source: ['indeed,solid-jobs', 'indeed'],
          state: 'failed,queued',
          trigger: 'scheduled',
          period: '30d',
          page: '3',
          size: '50',
        },
        catalog,
      ),
    ).toEqual({
      sources: ['solid-jobs', 'indeed'],
      states: ['queued', 'failed'],
      trigger: 'scheduled',
      period: '30d',
      page: 3,
      size: 50,
    })
  })

  it.each([10, 20, 50, 100])('accepts %i per page', (size) => {
    expect(readHistoryQuery({ size: String(size) }, catalog).size).toBe(size)
  })

  it('leaves out an unknown source and state and gives the default for an unreadable way of starting, period, page and 30 per page, without an error (T1-AC11)', () => {
    expect(
      readHistoryQuery(
        {
          source: 'nowhere',
          state: 'lost',
          trigger: 'by-hand',
          period: 'week',
          page: 'ten',
          size: '30',
        },
        catalog,
      ),
    ).toEqual(defaults)
    expect(
      readHistoryQuery({ source: 'nowhere,indeed' }, catalog).sources,
    ).toEqual(['indeed'])
    expect(
      readHistoryQuery({ trigger: ['manual', 'scheduled'] }, catalog),
    ).toEqual(defaults)
  })

  it('shows page 1 for page 0 or below and keeps a page beyond the last for the read to clamp (T1-AC11)', () => {
    expect(readHistoryQuery({ page: '0' }, catalog).page).toBe(1)
    expect(readHistoryQuery({ page: '-4' }, catalog).page).toBe(1)
    expect(readHistoryQuery({ page: '999' }, catalog).page).toBe(999)
    expect(readHistoryQuery({ page: '2.5' }, catalog).page).toBe(1)
  })
})

describe('the page address (T1-R10, T1-AC08)', () => {
  it('leaves out keys equal to their default', () => {
    expect(historyAddress(defaults)).toEqual({})
  })

  it('gives back the same view for an address with filters, page, size and an open sync', () => {
    const query: SyncHistoryQuery = {
      sources: ['himalayas', 'indeed'],
      states: ['partial', 'failed'],
      trigger: 'manual',
      period: 'all',
      page: 2,
      size: 10,
    }
    const address = historyAddress(query, 'a-sync')
    expect(address).toEqual({
      source: 'himalayas,indeed',
      state: 'partial,failed',
      trigger: 'manual',
      period: 'all',
      page: '2',
      size: '10',
      sync: 'a-sync',
    })
    expect(readHistoryQuery(address, catalog)).toEqual(query)
  })
})

describe('changing filters and pages (T1-R08, R09)', () => {
  const onPage3: SyncHistoryQuery = { ...defaults, page: 3, size: 50 }

  it('goes back to page 1 when a filter changes, and keeps the page when nothing changed (T1-AC06)', () => {
    for (const change of [
      { sources: ['indeed'] },
      { states: ['failed' as const] },
      { trigger: 'manual' as const },
      { period: 'today' as const },
    ])
      expect(changeFilters(onPage3, change).page, JSON.stringify(change)).toBe(
        1,
      )
    expect(changeFilters(onPage3, { period: '7d' })).toBe(onPage3)
    expect(historyAddress(changeFilters(onPage3, { period: 'all' }))).toEqual({
      period: 'all',
      size: '50',
    })
  })

  it('shows "Wyczyść filtry" only off the default and restores the default, keeping the number per page (T1-AC06, T1-AC07)', () => {
    expect(filtersAtDefault({ ...defaults, size: 100 } as never)).toBe(true)
    for (const change of [
      { sources: ['indeed'] },
      { states: ['queued' as const] },
      { trigger: 'scheduled' as const },
      { period: 'all' as const },
    ]) {
      const changed = changeFilters(onPage3, change)
      expect(filtersAtDefault(changed)).toBe(false)
      const cleared = clearFilters(changed)
      expect(filtersAtDefault(cleared)).toBe(true)
      expect(cleared).toEqual({ ...defaults, size: 50 })
    }
  })

  it('goes back to page 1 when the number per page changes (T1-AC07)', () => {
    expect(changePageSize(onPage3, 100)).toEqual({
      ...onPage3,
      size: 100,
      page: 1,
    })
    expect(changePageSize(onPage3, 50)).toBe(onPage3)
    expect(showPage(onPage3, 7).page).toBe(7)
  })

  it('applies a multi-choice list when it closes, an empty choice meaning all (T1-AC06)', () => {
    expect(choiceOnClose(['indeed'], ['indeed'])).toBeNull()
    expect(choiceOnClose(['indeed', 'bayt'], ['bayt', 'indeed'])).toBeNull()
    expect(choiceOnClose([], ['indeed', 'bayt'])).toEqual(['indeed', 'bayt'])
    expect(choiceOnClose(['indeed'], [])).toEqual([])
    expect(changeFilters(onPage3, { sources: [] }).sources).toEqual([])
  })

  it('counts at least one page', () => {
    expect(pageCount(0, 20)).toBe(1)
    expect(pageCount(20, 20)).toBe(1)
    expect(pageCount(21, 20)).toBe(2)
  })
})
