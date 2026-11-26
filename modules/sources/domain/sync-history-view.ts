import {
  formatDate,
  formatDateTime,
  formatDay,
  formatTime,
} from '../../../lib/time/index.ts'
import type {
  SyncDetails,
  SyncHistoryItem,
  SyncPeriod,
  SyncState,
  SyncTrigger,
} from './sync-history.ts'

/**
 * What the page "Synchronizacje" shows of the history (T1): texts, labels
 * and icons, the grouping by day, a row's result and the details. Pure
 * functions the page calls, so tests check them without a browser.
 */

export const stateLabels: Record<SyncState, string> = {
  // ASSUMPTION(oferty-pracy-nq3.1/ASM-1): "W kolejce" is gone only from the
  // offer views (sq2 T8-R04, T10-AC08); the sync state label keeps it (T1-R07).
  queued: 'W kolejce',
  running: 'W toku',
  complete: 'Pełna',
  partial: 'Niepełna',
  failed: 'Nieudana',
}

/** What each state means, in the label's tooltip (T1-R07). */
export const stateTooltips: Record<SyncState, string> = {
  queued: 'Zlecona, czeka na wolne miejsce do pobierania.',
  running:
    'Pobieranie trwa. Liczby rosną w miarę zapisywania kolejnych porcji ogłoszeń.',
  complete:
    'Sprawdzono cały ustawiony zakres źródła. Pełna synchronizacja nie znaczy, że pobrano cały portal — tylko cały zakres.',
  partial:
    'Pobrano tylko część zakresu. Pobrane ogłoszenia są zapisane; brak pozostałych nie oznacza, że są niedostępne.',
  failed:
    'Nie udało się pobrać żadnego ogłoszenia. Dostępność ogłoszeń tego źródła się nie zmieniła.',
}

/**
 * The state icons (T1-R07), as SVG paths on a 24×24 grid: hourglass,
 * an arrow, a tick, a half-filled circle, a cross. `filled` paths take the
 * text colour.
 */
export const stateIcons: Record<
  SyncState,
  { paths: string[]; filled?: string[] }
> = {
  queued: {
    paths: [
      'M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10',
    ],
  },
  running: { paths: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'] },
  complete: { paths: ['M20 6 9 17l-5-5'] },
  partial: {
    paths: ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z', 'M12 3v18'],
    filled: ['M12 3a9 9 0 0 0 0 18z'],
  },
  failed: { paths: ['M18 6 6 18M6 6l12 12'] },
}

/** The way-of-starting icon's tooltip in the details (T1-R12). */
export const triggerTooltips: Record<SyncTrigger, string> = {
  manual: 'Uruchomiona ręcznie',
  scheduled: 'Uruchomiona z harmonogramu dziennego',
}

/** A hand and a calendar with a clock (T1-R12), as SVG paths. */
export const triggerIcons: Record<SyncTrigger, { paths: string[] }> = {
  manual: {
    paths: [
      'M9 9V4.5a1.5 1.5 0 0 1 3 0V9',
      'M12 8.5V3.5a1.5 1.5 0 0 1 3 0V10',
      'M15 9.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3 14.5a1.6 1.6 0 0 1 2.6-1.8L9 15V9',
    ],
  },
  scheduled: {
    paths: [
      'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
      'M16 2v4M8 2v4M3 10h18',
      'M12 12.9a2.6 2.6 0 1 1 0 5.2a2.6 2.6 0 1 1 0-5.2z',
      'M12 14.4v1.2l.8.6',
    ],
  },
}

/** The choices of the filter "Sposób uruchomienia" (T1-R08). */
export const triggerChoices: { value: SyncTrigger | ''; label: string }[] = [
  { value: '', label: 'Wszystkie' },
  { value: 'manual', label: 'Ręcznie' },
  { value: 'scheduled', label: 'Z harmonogramu' },
]

/** The choices of the filter "Okres" (T1-R08). */
export const periodChoices: { value: SyncPeriod; label: string }[] = [
  { value: 'today', label: 'Dziś' },
  { value: '7d', label: 'Ostatnie 7 dni' },
  { value: '30d', label: 'Ostatnie 30 dni' },
  { value: 'all', label: 'Cała historia' },
]

export const emptyHistoryText = 'Brak synchronizacji dla wybranych filtrów'
export const problemText = 'Synchronizacja nie pobrała wszystkich ogłoszeń.'

/** What a multi-choice filter's button says: all, one name or a count. */
export function choiceSummary(
  chosen: readonly string[],
  label: (value: string) => string,
): string {
  if (!chosen.length) return 'Wszystkie'
  return chosen.length === 1 ? label(chosen[0]!) : `Wybrano: ${chosen.length}`
}

/** A day of the history page with its syncs, in the page's order. */
export type HistoryDay<T> = { heading: string; items: T[] }

/**
 * Groups one page's syncs under the Polish day they were requested
 * (T1-R03). Each page starts with a heading, so a day split between two
 * pages shows its heading again on the next one.
 */
export function groupByDay<T extends Pick<SyncHistoryItem, 'requestedAt'>>(
  items: readonly T[],
  now: Date = new Date(),
): HistoryDay<T>[] {
  const days: HistoryDay<T>[] = []
  for (const item of items) {
    // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a day other than today or
    // yesterday shows as its DD.MM.RRRR date.
    const heading = formatDay(new Date(item.requestedAt), now)
    const last = days.at(-1)
    if (last?.heading === heading) last.items.push(item)
    else days.push({ heading, items: [item] })
  }
  return days
}

/** The time a sync was requested, in its row (T1-R04). */
// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a time shows as HH:mm.
export const rowTime = (item: Pick<SyncHistoryItem, 'requestedAt'>): string =>
  formatTime(new Date(item.requestedAt))

/** Why a sync of a source that marks unavailable ads shows no count. */
export const incompleteUnavailableTooltip =
  'Tylko pełna synchronizacja oznacza ogłoszenia jako niedostępne'

/**
 * The tooltip of a complete sync finished before counts were recorded
 * (T2-R04): the Polish date of the first recorded count, or the text used
 * while none is recorded.
 */
export const countedSinceTooltip = (since: string | null): string =>
  since
    ? `Liczone od ${formatDate(new Date(since))}`
    : 'Liczone od wdrożenia tej funkcji'

/** What the page knows besides the sync to show its unavailable count. */
export type UnavailableContext = {
  /** Whether the sync's source marks unavailable ads (T2-R07). */
  marksUnavailable: boolean
  /** The history read's moment since which counts are recorded. */
  countedSince: string | null
}

/** What a sync shows of the ads it marked unavailable (T2-R02–R04, R07). */
export type UnavailableCount =
  | { kind: 'not-applicable' }
  | { kind: 'unfinished' }
  | { kind: 'counted'; count: number }
  | { kind: 'not-counted'; tip: string }

export function unavailableCount(
  item: Pick<SyncHistoryItem, 'status' | 'markedUnavailable'>,
  context: UnavailableContext,
): UnavailableCount {
  if (!context.marksUnavailable) return { kind: 'not-applicable' }
  if (item.status === 'queued' || item.status === 'running')
    return { kind: 'unfinished' }
  if (item.status !== 'complete')
    return { kind: 'not-counted', tip: incompleteUnavailableTooltip }
  if (item.markedUnavailable === null)
    return {
      kind: 'not-counted',
      tip: countedSinceTooltip(context.countedSince),
    }
  return { kind: 'counted', count: item.markedUnavailable }
}

/** One number of a finished sync's row; `tip` is its tooltip. */
export type RowPart = {
  key: 'new' | 'changed' | 'unavailable'
  text: string
  zero: boolean
  tip?: string
}

/** A row's result (T1-R05) with its unavailable count (T2-R02, R03, R07). */
export type RowResult =
  | { kind: 'queued'; text: string }
  | { kind: 'running'; text: string }
  | { kind: 'finished'; parts: RowPart[] }

export function rowResult(
  item: Pick<
    SyncHistoryItem,
    'status' | 'seen' | 'newAds' | 'changedAds' | 'markedUnavailable'
  >,
  context: UnavailableContext,
): RowResult {
  if (item.status === 'queued')
    return { kind: 'queued', text: 'Czeka na start' }
  if (item.status === 'running')
    return { kind: 'running', text: `Znaleziono ${item.seen} · trwa…` }
  const fresh = item.newAds ?? 0
  const changed = item.changedAds ?? 0
  const parts: RowPart[] = [
    { key: 'new', text: `+${fresh} nowe`, zero: fresh === 0 },
    { key: 'changed', text: `${changed} zmienione`, zero: changed === 0 },
  ]
  const unavailable = unavailableCount(item, context)
  if (unavailable.kind === 'counted')
    parts.push({
      key: 'unavailable',
      text: `${unavailable.count} niedostępne`,
      zero: unavailable.count === 0,
    })
  else if (unavailable.kind === 'not-counted')
    parts.push({
      key: 'unavailable',
      text: '— niedostępne',
      zero: true,
      tip: unavailable.tip,
    })
  return { kind: 'finished', parts }
}

/**
 * The numbers of the details (T1-R13): "—" while the sync is unfinished.
 * The fourth is the unavailable count (T2-R02–R04, R07): the number, "—"
 * with its tooltip, or "nie dotyczy" for a source that does not mark.
 */
export function detailNumbers(
  details: Pick<
    SyncDetails,
    'status' | 'seen' | 'newAds' | 'changedAds' | 'markedUnavailable'
  >,
  context: UnavailableContext,
): { label: string; value: string; tip?: string }[] {
  const number = (value: number | null) =>
    value === null ? '—' : String(value)
  return [
    { label: 'znalezionych ogłoszeń', value: String(details.seen) },
    {
      label: 'nowych — pierwszy raz w tym źródle',
      value: number(details.newAds),
    },
    {
      label: 'zmienionych — zapisano nową wersję treści',
      value: number(details.changedAds),
    },
    { label: 'oznaczonych jako niedostępne w źródle', ...unavailableValue() },
  ]

  function unavailableValue(): { value: string; tip?: string } {
    const unavailable = unavailableCount(details, context)
    switch (unavailable.kind) {
      case 'not-applicable':
        return { value: 'nie dotyczy' }
      // ASSUMPTION(oferty-pracy-nq3.2/ASM-1): an unfinished sync shows "—"
      // without a tooltip, as its new and changed ads do (T1-R13).
      case 'unfinished':
        return { value: '—' }
      case 'counted':
        return { value: String(unavailable.count) }
      case 'not-counted':
        return { value: '—', tip: unavailable.tip }
    }
  }
}

/** Elapsed time as the details show it: seconds, minutes or hours. */
export function durationText(milliseconds: number): string {
  const minute = 60_000
  const hour = 60 * minute
  if (milliseconds < minute)
    return `${Math.max(1, Math.round(milliseconds / 1000))} s`
  if (milliseconds < hour) return `${Math.round(milliseconds / minute)} min`
  return `${(milliseconds / hour).toFixed(1).replace('.', ',')} h`
}

/**
 * The course of a sync (T1-R14): requested, started, finished, duration
 * and portions fetched; a time not reached yet shows "—". No attempt
 * number.
 */
export function syncCourse(
  details: Pick<
    SyncDetails,
    'requestedAt' | 'startedAt' | 'finishedAt' | 'pages'
  >,
): { label: string; value: string }[] {
  // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a date with time shows as
  // DD.MM.RRRR HH:mm.
  const moment = (value: string | null) =>
    value ? formatDateTime(new Date(value)) : '—'
  const duration =
    details.startedAt && details.finishedAt
      ? durationText(
          Date.parse(details.finishedAt) - Date.parse(details.startedAt),
        )
      : '—'
  return [
    { label: 'Zlecona', value: moment(details.requestedAt) },
    { label: 'Start', value: moment(details.startedAt) },
    { label: 'Koniec', value: moment(details.finishedAt) },
    { label: 'Czas trwania', value: duration },
    { label: 'Pobrane porcje', value: String(details.pages) },
  ]
}

/**
 * What went wrong (T1-R15): for a Niepełna or Nieudana sync the generic
 * sentence, and the stored error and diagnostics as text, or null when it
 * has neither. Null for other states.
 */
export function syncProblem(
  details: Pick<SyncDetails, 'status' | 'error' | 'diagnostics'>,
): { text: string; technical: string | null } | null {
  if (details.status !== 'partial' && details.status !== 'failed') return null
  const parts: string[] = []
  if (details.error) parts.push(details.error)
  if (details.diagnostics !== null && details.diagnostics !== undefined)
    parts.push(JSON.stringify(details.diagnostics, null, 2))
  return {
    text: problemText,
    technical: parts.length ? parts.join('\n\n') : null,
  }
}
