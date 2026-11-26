import { describe, expect, it } from 'vitest'
import type { HealthWarning } from './source-health.ts'
import {
  shownWarnings,
  stripCounts,
  warningHeading,
  warningQuery,
  warningReasons,
} from './source-health-view.ts'
import { defaultFilters, type SyncHistoryQuery } from './sync-history.ts'

const warning = (
  name: string,
  options: Partial<HealthWarning> = {},
): HealthWarning => ({
  source: name.toLowerCase(),
  name,
  latestCompleteAt: null,
  reasons: ['no-complete'],
  ...options,
})

describe('source health on the page (T4)', () => {
  it('shows the three counts of the strip with their labels (T4-R01–R03)', () => {
    expect(
      stripCounts({
        unfinished: 3,
        latestProblem: 2,
        newIn24h: 7,
        warnings: [],
      }).map(({ label, value }) => `${label}: ${value}`),
    ).toEqual([
      'W kolejce lub w toku: 3',
      'Ostatnia synchronizacja nieudana lub niepełna: 2',
      'Nowe w 24 h: 7',
    ])
  })

  // ASSUMPTION(oferty-pracy-nq3.4/ASM-1): one list under one heading, each source with its reasons in brackets.
  it('names each reason: "nigdy" without a complete sync, its day otherwise, and "3 nieudane z rzędu", both together (T4-R04, R05; ASM-1)', () => {
    expect(warningHeading).toBe(
      'Bez pełnej synchronizacji od 3 dni lub 3 nieudane z rzędu',
    )
    expect(warningReasons(warning('Bayt'))).toBe('ostatnia pełna: nigdy')
    expect(
      warningReasons(
        warning('Bayt', { latestCompleteAt: '2026-11-22T23:30:00Z' }),
      ),
    ).toBe('ostatnia pełna: 23.11.2026')
    expect(warningReasons(warning('Bayt', { reasons: ['failing'] }))).toBe(
      '3 nieudane z rzędu',
    )
    expect(
      warningReasons(warning('Bayt', { reasons: ['no-complete', 'failing'] })),
    ).toBe('ostatnia pełna: nigdy · 3 nieudane z rzędu')
  })

  it('shows three names and "i 2 innych" of five, every name once expanded, and no warning with none (T4-AC06)', () => {
    const five = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((name) =>
      warning(name),
    )
    const folded = shownWarnings(five, false)!
    expect(folded.shown.map((item) => item.name)).toEqual([
      'Alfa',
      'Beta',
      'Gamma',
    ])
    expect(folded.more).toBe('i 2 innych')
    const expanded = shownWarnings(five, true)!
    expect(expanded.shown).toHaveLength(5)
    expect(expanded.more).toBeNull()
    expect(shownWarnings(five.slice(0, 3), false)).toEqual({
      shown: five.slice(0, 3),
      more: null,
    })
    expect(shownWarnings([], false)).toBeNull()
  })

  it('a click on a name shows the history of that source over every period, the other filters at defaults (T4-AC06)', () => {
    const query: SyncHistoryQuery = {
      sources: ['bayt', 'himalayas'],
      states: ['failed'],
      trigger: 'scheduled',
      period: 'today',
      page: 4,
      size: 50,
    }
    expect(warningQuery(query, 'solid-jobs')).toEqual({
      ...defaultFilters,
      sources: ['solid-jobs'],
      states: [],
      period: 'all',
      page: 1,
      size: 50,
    })
  })
})
