import { describe, expect, it } from 'vitest'
import { syncStates, type SyncDetails } from './sync-history.ts'
import {
  detailNumbers,
  durationText,
  emptyHistoryText,
  groupByDay,
  rowResult,
  rowTime,
  stateIcons,
  stateLabels,
  stateTooltips,
  syncCourse,
  syncProblem,
  triggerIcons,
  triggerTooltips,
} from './sync-history-view.ts'

const item = (requestedAt: string, id = requestedAt) => ({ id, requestedAt })

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): shown times are HH:mm, other days DD.MM.RRRR.
describe('the history grouped by Polish day (T1-R03, T1-AC02)', () => {
  const now = new Date('2026-11-26T10:00:00Z')

  it('puts syncs under "Dziś", "Wczoraj" and the date of their request in Polish time', () => {
    const days = groupByDay(
      [
        item('2026-11-26T09:00:00Z'),
        // 00:30 on 26 November in Poland.
        item('2026-11-25T23:30:00Z'),
        // 23:30 on 25 November in Poland.
        item('2026-11-25T22:30:00Z'),
        // 00:00 on 25 November in Poland.
        item('2026-11-24T23:00:00Z'),
        item('2026-11-20T08:00:00Z'),
      ],
      now,
    )
    expect(
      days.map((day) => [day.heading, day.items.map((i) => i.requestedAt)]),
    ).toEqual([
      ['Dziś', ['2026-11-26T09:00:00Z', '2026-11-25T23:30:00Z']],
      ['Wczoraj', ['2026-11-25T22:30:00Z', '2026-11-24T23:00:00Z']],
      ['20.11.2026', ['2026-11-20T08:00:00Z']],
    ])
  })

  it('repeats the heading of a day split between two pages', () => {
    const all = [
      item('2026-11-26T09:00:00Z'),
      item('2026-11-26T08:00:00Z'),
      item('2026-11-26T07:00:00Z'),
      item('2026-11-25T07:00:00Z'),
    ]
    const first = groupByDay(all.slice(0, 2), now)
    const second = groupByDay(all.slice(2), now)
    expect(first.map((day) => day.heading)).toEqual(['Dziś'])
    expect(second.map((day) => day.heading)).toEqual(['Dziś', 'Wczoraj'])
  })

  it('shows the time of the request in Polish time', () => {
    expect(rowTime(item('2026-11-26T09:05:00Z'))).toBe('10:05')
    expect(rowTime(item('2026-07-01T06:00:00Z'))).toBe('08:00')
  })
})

describe('a row’s result and the details’ numbers (T1-R05, R13, T1-AC04)', () => {
  const sync = { seen: 7, newAds: null, changedAds: null }

  it('shows "Czeka na start" for a queued sync and the ads found so far for a running one', () => {
    expect(rowResult({ ...sync, status: 'queued', seen: 0 })).toEqual({
      kind: 'queued',
      text: 'Czeka na start',
    })
    expect(rowResult({ ...sync, status: 'running' })).toEqual({
      kind: 'running',
      text: 'Znaleziono 7 · trwa…',
    })
  })

  it('shows "+N nowe" and "N zmienione" for each finished state, zeros greyed', () => {
    for (const status of ['complete', 'partial', 'failed'] as const)
      expect(
        rowResult({ status, seen: 7, newAds: 3, changedAds: 0 }),
        status,
      ).toEqual({
        kind: 'finished',
        parts: [
          { key: 'new', text: '+3 nowe', zero: false },
          { key: 'changed', text: '0 zmienione', zero: true },
        ],
      })
  })

  it('shows "—" for new and changed in the details of a queued or running sync', () => {
    expect(detailNumbers(sync).map((n) => n.value)).toEqual(['7', '—', '—'])
    expect(
      detailNumbers({ seen: 7, newAds: 2, changedAds: 1 }).map((n) => n.value),
    ).toEqual(['7', '2', '1'])
  })
})

describe('the state label (T1-R07, T1-AC05)', () => {
  it('has a label, an icon and the tooltip text of each state', () => {
    expect(stateLabels).toEqual({
      queued: 'W kolejce',
      running: 'W toku',
      complete: 'Pełna',
      partial: 'Niepełna',
      failed: 'Nieudana',
    })
    expect(stateTooltips).toEqual({
      queued: 'Zlecona, czeka na wolne miejsce do pobierania.',
      running:
        'Pobieranie trwa. Liczby rosną w miarę zapisywania kolejnych porcji ogłoszeń.',
      complete:
        'Sprawdzono cały ustawiony zakres źródła. Pełna synchronizacja nie znaczy, że pobrano cały portal — tylko cały zakres.',
      partial:
        'Pobrano tylko część zakresu. Pobrane ogłoszenia są zapisane; brak pozostałych nie oznacza, że są niedostępne.',
      failed:
        'Nie udało się pobrać żadnego ogłoszenia. Dostępność ogłoszeń tego źródła się nie zmieniła.',
    })
    const icons = syncStates.map((state) => JSON.stringify(stateIcons[state]))
    expect(new Set(icons).size).toBe(syncStates.length)
    // A half-filled circle: only Niepełna fills part of its icon.
    expect(syncStates.filter((state) => stateIcons[state].filled)).toEqual([
      'partial',
    ])
  })
})

describe('the details (T1-R12, R14, R15, T1-AC10)', () => {
  const details: SyncDetails = {
    id: 'x',
    source: 'bayt',
    trigger: 'scheduled',
    status: 'failed',
    requestedAt: '2026-11-26T08:00:00Z',
    startedAt: '2026-11-26T08:00:30Z',
    finishedAt: '2026-11-26T08:04:30Z',
    seen: 0,
    newAds: 0,
    changedAds: 0,
    pages: 2,
    error: 'HTTP 429 <script>',
    diagnostics: { stopReason: 'http_429' },
  }

  it('has an icon and a tooltip for each way of starting', () => {
    expect(triggerTooltips).toEqual({
      manual: 'Uruchomiona ręcznie',
      scheduled: 'Uruchomiona z harmonogramu dziennego',
    })
    expect(triggerIcons.manual).not.toEqual(triggerIcons.scheduled)
  })

  // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a date with time is DD.MM.RRRR HH:mm.
  it('shows the course without an attempt number, "—" for a time not reached', () => {
    expect(syncCourse(details)).toEqual([
      { label: 'Zlecona', value: '26.11.2026 09:00' },
      { label: 'Start', value: '26.11.2026 09:00' },
      { label: 'Koniec', value: '26.11.2026 09:04' },
      { label: 'Czas trwania', value: '4 min' },
      { label: 'Pobrane porcje', value: '2' },
    ])
    expect(
      syncCourse({ ...details, startedAt: null, finishedAt: null }).map(
        (step) => step.value,
      ),
    ).toEqual(['26.11.2026 09:00', '—', '—', '—', '2'])
    expect(
      syncCourse(details).some((step) => /Próba|próba/.test(step.label)),
    ).toBe(false)
  })

  it('shows durations in seconds, minutes and hours', () => {
    expect(durationText(400)).toBe('1 s')
    expect(durationText(42_000)).toBe('42 s')
    expect(durationText(5 * 60_000)).toBe('5 min')
    expect(durationText(90 * 60_000)).toBe('1,5 h')
  })

  it('shows for Niepełna and Nieudana the generic sentence with the stored error and diagnostics as text', () => {
    for (const status of ['partial', 'failed'] as const)
      expect(syncProblem({ ...details, status })).toEqual({
        text: 'Synchronizacja nie pobrała wszystkich ogłoszeń.',
        technical: 'HTTP 429 <script>\n\n{\n  "stopReason": "http_429"\n}',
      })
    expect(syncProblem({ ...details, error: null, diagnostics: null })).toEqual(
      {
        text: 'Synchronizacja nie pobrała wszystkich ogłoszeń.',
        technical: null,
      },
    )
    for (const status of ['queued', 'running', 'complete'] as const)
      expect(syncProblem({ ...details, status })).toBeNull()
  })

  it('says what an empty list shows (T1-R11, T1-AC09)', () => {
    expect(emptyHistoryText).toBe('Brak synchronizacji dla wybranych filtrów')
  })
})
