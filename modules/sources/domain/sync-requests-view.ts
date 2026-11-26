import { finishedRunStatuses } from './run-states.ts'
import {
  countOutcomes,
  type PanelSyncCounts,
  type PanelSyncResult,
} from './panel-syncs.ts'
import {
  clearFilters,
  type CatalogSource,
  type SyncDetails,
  type SyncHistoryQuery,
} from './sync-history.ts'

/**
 * What the page "Synchronizacje" shows and does when it requests syncs
 * (T3): the dialog's sources, the summary after confirming, the list it
 * reads then and "Uruchom ponownie". Pure functions the page calls, so
 * tests check them without a browser.
 */

export const runningNote = 'już trwa'
export const disabledNote = 'Wyłączone w konfiguracji aplikacji'

/** How the dialog opens: "Synchronizuj wszystkie" or "Wybierz źródła". */
export type DialogPreset = 'all' | 'none'

export const dialogTitles: Record<DialogPreset, string> = {
  all: 'Synchronizuj wszystkie źródła',
  none: 'Wybierz źródła',
}

/** One catalogue source in the dialog. */
export type DialogSource = {
  id: string
  name: string
  /** Whether it can be checked. */
  checkable: boolean
  /** Why it cannot be checked, or null (T3-R02). */
  note: string | null
}

/**
 * Every catalogue source in the dialog (T3-R01, R02). A disabled source,
 * and a source with an unfinished sync, cannot be checked; a disabled one
 * shows why even while it has an unfinished sync.
 */
export function dialogSources(
  sources: readonly CatalogSource[],
): DialogSource[] {
  return sources.map((source) => {
    const note = !source.enabled
      ? disabledNote
      : source.unfinishedRun
        ? runningNote
        : null
    return { id: source.id, name: source.name, checkable: !note, note }
  })
}

/**
 * The sources checked when the dialog opens (T3-R01): every source that
 * can be checked for "Synchronizuj wszystkie", none for "Wybierz źródła".
 */
export function initiallyChecked(
  sources: readonly DialogSource[],
  preset: DialogPreset,
): string[] {
  return preset === 'all'
    ? sources.filter((source) => source.checkable).map((source) => source.id)
    : []
}

/** "Synchronizuj" is active once a source is checked (T3-R01). */
export const canConfirm = (checked: readonly string[]): boolean =>
  checked.length > 0

/** The summary after confirming (T3-R07). */
export const requestSummary = (counts: PanelSyncCounts): string =>
  `Zlecono: ${counts.requested} · już trwało: ${counts.alreadyRunning} · pominięto: ${counts.skipped}`

/**
 * The message about sources whose sync could not be requested (T3-R06),
 * or null when there is none.
 */
export const requestFailure = (counts: PanelSyncCounts): string | null =>
  counts.notRequested
    ? `Nie udało się zlecić synchronizacji: ${counts.notRequested}.`
    : null

/**
 * The result the page shows when the request got no answer: the page
 * cannot tell which source was requested, so every sent source counts as
 * not requested (T3-R06).
 * ASSUMPTION(oferty-pracy-nq3.3/ASM-2): a request without an answer counts every sent source as not requested.
 */
export function unansweredRequest(sources: readonly string[]): PanelSyncResult {
  const outcomes = [...new Set(sources)].map((source) => ({
    source,
    outcome: 'not-requested' as const,
  }))
  return { outcomes, counts: countOutcomes(outcomes) }
}

/**
 * The list the page reads once after confirming (T3-R07): the state
 * filter of queued and running syncs, the other filters at their defaults and
 * page 1; the number per page is no filter and stays.
 */
export const afterRequestQuery = (
  query: SyncHistoryQuery,
): SyncHistoryQuery => ({
  ...clearFilters(query),
  states: ['queued', 'running'],
})

/**
 * Whether the details offer "Uruchom ponownie" (T3-R08): a finished sync
 * of an enabled source. A source the catalogue does not list is not
 * enabled.
 */
export function rerunOffered(
  details: Pick<SyncDetails, 'status' | 'source'>,
  sources: readonly CatalogSource[],
): boolean {
  const finished = (finishedRunStatuses as readonly string[]).includes(
    details.status,
  )
  return (
    finished &&
    sources.some((source) => source.id === details.source && source.enabled)
  )
}

/**
 * What "Uruchom ponownie" does with the answer (T3-R08): it opens the new
 * sync, or the source's unfinished one. When neither exists, the source
 * was skipped or not requested, and the page keeps the details open and
 * shows the summary and the message of a confirmation (T3-R06, R07).
 * ASSUMPTION(oferty-pracy-nq3.3/ASM-1): a rerun that requested nothing keeps the details and shows the dialog's summary and message.
 */
export function rerunOutcome(
  result: PanelSyncResult,
): { open: string } | { summary: string; failure: string | null } {
  const outcome = result.outcomes[0]
  if (outcome && 'runId' in outcome) return { open: outcome.runId }
  return {
    summary: requestSummary(result.counts),
    failure: requestFailure(result.counts),
  }
}
