import { describe, expect, it } from 'vitest'
import { syncStates, type SyncDetails } from './sync-history.ts'
import {
  detailNumbers,
  durationText,
  emptyHistoryText,
  escapeCloses,
  groupByDay,
  pageJumpKey,
  pageJumpNumbers,
  rowResult,
  rowTime,
  stateIcons,
  stateLabels,
  stateTooltips,
  syncCourse,
  syncProblem,
  tooltipPosition,
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

describe('the tooltip’s position (T1-R07, T1-AC05)', () => {
  const viewport = { width: 1000, height: 700 }
  const size = { width: 380, height: 60 }
  const box = (left: number, top: number, width = 80, height = 20) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  })
  const keepsMargin = (position: { left: number; top: number }) => {
    expect(position.left).toBeGreaterThanOrEqual(16)
    expect(position.top).toBeGreaterThanOrEqual(16)
    expect(position.left + size.width).toBeLessThanOrEqual(viewport.width - 16)
    expect(position.top + size.height).toBeLessThanOrEqual(viewport.height - 16)
  }

  it('sits under the label, aligned with its right edge', () => {
    const position = tooltipPosition(box(500, 100), size, viewport)
    expect(position).toEqual({ left: 200, top: 128 })
    keepsMargin(position)
  })

  it('keeps 16 px from the right edge for a label at the right edge of the window', () => {
    const position = tooltipPosition(box(930, 100, 70), size, viewport)
    expect(position.left).toBe(viewport.width - size.width - 16)
    keepsMargin(position)
  })

  it('keeps 16 px from the left, the top and the bottom edges', () => {
    keepsMargin(tooltipPosition(box(0, 100, 40), size, viewport))
    const low = tooltipPosition(box(500, 660), size, viewport)
    expect(low.top).toBe(660 - size.height - 8)
    keepsMargin(low)
    keepsMargin(tooltipPosition(box(500, 0, 80, 5), size, viewport))
  })
})

describe('the page list (T1-R09, T1-AC07)', () => {
  it('lists every page, and the pages starting with the typed digits', () => {
    expect(pageJumpNumbers(3, { typed: '' })).toEqual([1, 2, 3])
    expect(pageJumpNumbers(18, { typed: '1' })).toEqual([
      1, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ])
    expect(pageJumpNumbers(18, { typed: '12' })).toEqual([12])
    expect(pageJumpNumbers(18, { typed: '9' })).toEqual([9])
    expect(pageJumpNumbers(18, { typed: '19' })).toEqual([])
  })

  it('narrows by typed digits, restores the previous list on Backspace, opens the first page on Enter and closes on Escape', () => {
    let jump = { typed: '' }
    const press = (key: string) => {
      const outcome = pageJumpKey(18, jump, key)
      if (outcome.action === 'list') jump = outcome.jump
      return outcome
    }
    press('1')
    const afterOne = pageJumpNumbers(18, jump)
    press('2')
    expect(pageJumpNumbers(18, jump)).toEqual([12])
    press('Backspace')
    expect(pageJumpNumbers(18, jump)).toEqual(afterOne)
    expect(press('Enter')).toEqual({ action: 'open', page: 1 })
    press('5')
    expect(press('Enter')).toEqual({ action: 'open', page: 15 })
    expect(press('a')).toEqual({ action: 'list', jump: { typed: '15' } })
    expect(press('Escape')).toEqual({ action: 'close' })
    expect(pageJumpKey(18, { typed: '9' }, '9')).toEqual({
      action: 'list',
      jump: { typed: '99' },
    })
    expect(pageJumpKey(18, { typed: '99' }, 'Enter')).toEqual({
      action: 'list',
      jump: { typed: '99' },
    })
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

describe('Escape on the page (T1-R12, T1-AC10)', () => {
  it('closes the details when no list is open, an open list first', () => {
    const open = { filterList: false, pageList: false, details: true }
    expect(escapeCloses(open)).toBe('details')
    expect(escapeCloses({ ...open, pageList: true })).toBe('pageList')
    expect(escapeCloses({ ...open, filterList: true })).toBe('filterList')
    expect(escapeCloses({ ...open, details: false })).toBeNull()
  })
})
