/**
 * The filters, paging and address of the sync history (T1-R08–R10, R17):
 * the history read reads the page's address with its defaults, and the
 * page builds the next address from the filters the read returns. Pure: no
 * storage, no configuration.
 */

import {
  runTriggers,
  syncRunStatuses,
  type RunTrigger,
  type SyncRunStatus,
} from './run-states.ts'
import {
  defaultPageSize,
  readPage,
  readPageSize,
  type PageSize,
} from '../../../lib/paging.ts'

/** The history's states are the run statuses, read from their one list. */
export const syncStates = syncRunStatuses
export type SyncState = SyncRunStatus

/** The ways of starting, read from their one list. */
export const syncTriggers = runTriggers
export type SyncTrigger = RunTrigger

export const syncPeriods = ['today', '7d', '30d', 'all'] as const
export type SyncPeriod = (typeof syncPeriods)[number]

/** The history's filters; an empty list means every value. */
export type SyncHistoryFilters = {
  sources: string[]
  states: SyncState[]
  /** Null: both ways of starting. */
  trigger: SyncTrigger | null
  period: SyncPeriod
}

/** What the page's address holds besides the open sync. */
export type SyncHistoryQuery = SyncHistoryFilters & {
  page: number
  size: PageSize
}

export const defaultFilters: SyncHistoryFilters = Object.freeze({
  sources: [],
  states: [],
  trigger: null,
  period: '7d',
}) as SyncHistoryFilters

/** The address's values of a key: repeated or comma-separated. */
function values(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
  return list
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

/** The single value of a key, or null when it is missing or repeated. */
function single(raw: unknown): string | null {
  const list = values(raw)
  return list.length === 1 ? list[0]! : null
}

const oneOf = <T extends string>(
  allowed: readonly T[],
  value: string | null,
): T | null =>
  value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null

/** Each allowed value once, in the order of `allowed`. */
const subset = <T extends string>(allowed: readonly T[], raw: unknown): T[] => {
  const chosen = new Set(values(raw))
  return allowed.filter((value) => chosen.has(value))
}

/**
 * Reads the history query from the page's address (T1-R17): an unknown
 * source or state is left out, an unreadable way of starting, period, page
 * or number per page gives its default, and a page below 1 gives 1. The
 * page beyond the last is left to the read, which knows the total.
 * `catalog` is every catalogue source id, in catalogue order.
 */
export function readHistoryQuery(
  address: Record<string, unknown>,
  catalog: readonly string[],
): SyncHistoryQuery {
  return {
    sources: subset(catalog, address.source),
    states: subset(syncStates, address.state),
    trigger: oneOf(syncTriggers, single(address.trigger)),
    period: oneOf(syncPeriods, single(address.period)) ?? defaultFilters.period,
    page: readPage(single(address.page)),
    size: readPageSize(single(address.size)),
  }
}

/** Whether every filter is at its default (T1-R08); the size is no filter. */
export const filtersAtDefault = (filters: SyncHistoryFilters): boolean =>
  !filters.sources.length &&
  !filters.states.length &&
  filters.trigger === defaultFilters.trigger &&
  filters.period === defaultFilters.period

/**
 * The page's address for the query and the open sync (T1-R10): keys equal
 * to their default are left out, lists comma-separated.
 */
export function historyAddress(
  query: SyncHistoryQuery,
  sync: string | null = null,
): Record<string, string> {
  const address: Record<string, string> = {}
  if (query.sources.length) address.source = query.sources.join(',')
  if (query.states.length) address.state = query.states.join(',')
  if (query.trigger) address.trigger = query.trigger
  if (query.period !== defaultFilters.period) address.period = query.period
  if (query.page > 1) address.page = String(query.page)
  if (query.size !== defaultPageSize) address.size = String(query.size)
  if (sync) address.sync = sync
  return address
}

/**
 * The query after a filter changed: back to page 1 (T1-R08). A change
 * that leaves the filters as they were keeps the page.
 */
export function changeFilters(
  query: SyncHistoryQuery,
  change: Partial<SyncHistoryFilters>,
): SyncHistoryQuery {
  const next = { ...query, ...change }
  return sameFilters(query, next) ? query : { ...next, page: 1 }
}

/** The query after "Wyczyść filtry": default filters, the size kept (T1-R09). */
export const clearFilters = (query: SyncHistoryQuery): SyncHistoryQuery => ({
  ...defaultFilters,
  sources: [],
  states: [],
  page: 1,
  size: query.size,
})

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value) => b.includes(value))

function sameFilters(a: SyncHistoryFilters, b: SyncHistoryFilters): boolean {
  return (
    sameList(a.sources, b.sources) &&
    sameList(a.states, b.states) &&
    a.trigger === b.trigger &&
    a.period === b.period
  )
}

/** A catalogue source as the history and its filters show it. */
export type CatalogSource = {
  id: string
  name: string
  enabled: boolean
  /** Whether its complete sync marks absent ads unavailable at the source. */
  marksUnavailable: boolean
  /**
   * The id of the source's queued or running sync, or null; the dialog of
   * T3 marks such a source "już trwa" (T3 approach, item 4).
   */
  unfinishedRun: string | null
}

/** One sync of the history; moments are ISO text in UTC. */
export type SyncHistoryItem = {
  id: string
  source: string
  trigger: SyncTrigger
  status: SyncState
  requestedAt: string
  /** Unique ads the sync saw so far. */
  seen: number
  /** New and changed ads (T1-R06); null while the sync is unfinished. */
  newAds: number | null
  changedAds: number | null
  /**
   * Ads this sync changed from available to unavailable at the source
   * (T2-R01); recorded only by a complete sync of a source that marks
   * unavailable ads, null otherwise and for syncs finished before it was
   * recorded.
   */
  markedUnavailable: number | null
}

/** One page of the history read (T1). */
export type SyncHistoryPage = {
  items: SyncHistoryItem[]
  /** Matching syncs. */
  total: number
  /** The page shown, clamped to the existing pages; 1 when none match. */
  page: number
  pages: number
  size: PageSize
  filters: SyncHistoryFilters
  sources: CatalogSource[]
  /**
   * The finish of the earliest sync that recorded its count of ads marked
   * unavailable, ISO text in UTC; null while none has (T2-R04).
   */
  unavailableCountedSince: string | null
}

/** One sync's details (T1-R12–R15). */
export type SyncDetails = SyncHistoryItem & {
  startedAt: string | null
  finishedAt: string | null
  /** Portions fetched. */
  pages: number
  error: string | null
  diagnostics: unknown
}
