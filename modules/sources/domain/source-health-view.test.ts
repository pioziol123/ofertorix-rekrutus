import { describe, expect, it } from 'vitest'
import { sourceWarnings, type HealthWarning } from './source-health.ts'
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

  // ASSUMPTION(oferty-pracy-nq3.4/ASM-1): each source shows its reasons in brackets after its name.
  it('names each reason: "nigdy" without a complete sync, its day otherwise, and "3 nieudane z rzędu", both together (T4-R04, R05; ASM-1)', () => {
    expect(warningHeading).toBe('Bez pełnej synchronizacji od 3 dni')
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

  it('shows the first three names alphabetically and "i 2 innych" of five, every name once expanded, and no warning with none (T4-AC06)', () => {
    const now = new Date('2026-11-26T12:00:00Z')
    // Five sources to list, read in another order than their names.
    const { warnings } = sourceWarnings(
      ['Gamma', 'Epsilon', 'Alfa', 'Delta', 'Beta'].map((name) => ({
        source: name.toLowerCase(),
        name,
        latestCompleteAt: null,
        latestFinished: [],
      })),
      now,
    )
    const folded = shownWarnings(warnings, false)!
    expect(folded.shown.map((item) => item.name)).toEqual([
      'Alfa',
      'Beta',
      'Delta',
    ])
    expect(folded.more).toBe('i 2 innych')
    const expanded = shownWarnings(warnings, true)!
    expect(expanded.shown.map((item) => item.name)).toEqual([
      'Alfa',
      'Beta',
      'Delta',
      'Epsilon',
      'Gamma',
    ])
    expect(expanded.more).toBeNull()
    const three = [warning('Alfa'), warning('Beta'), warning('Delta')]
    expect(shownWarnings(three, false)).toEqual({ shown: three, more: null })
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
