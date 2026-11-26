import { formatDate } from '../../../lib/time/index.ts'
import type { HealthWarning, SourceHealth } from './source-health.ts'
import { clearFilters, type SyncHistoryQuery } from './sync-history.ts'

/**
 * What the page "Synchronizacje" shows of source health (T4): the counts
 * of the strip, the warning list with its reasons, its folding and what a
 * click on a name does. Pure functions the page calls, so tests check them
 * without a browser.
 */

/** The strip's counts in their order (T4-R01–R03); none is clickable. */
export function stripCounts(
  health: SourceHealth,
): { key: string; label: string; value: number }[] {
  return [
    {
      // ASSUMPTION(oferty-pracy-nq3.1/ASM-1): the removal of "W kolejce" covers only the offer views, so the strip keeps it too (T4-R01).
      key: 'unfinished',
      label: 'W kolejce lub w toku',
      value: health.unfinished,
    },
    {
      key: 'problem',
      label: 'Ostatnia synchronizacja nieudana lub niepełna',
      value: health.latestProblem,
    },
    { key: 'new', label: 'Nowe w 24 h', value: health.newIn24h },
  ]
}

/** The warning's heading: one list of the sources of T4-R04 and R05. */
export const warningHeading = 'Bez pełnej synchronizacji od 3 dni'

/**
 * What the strip's place shows when the strip cannot be read, while the
 * history can.
 * ASSUMPTION(oferty-pracy-nq3.4/ASM-2): a strip that cannot be read leaves the history working and shows a notice in its place.
 */
export const healthFailureText =
  'Nie udało się wczytać podsumowania źródeł. Spróbuj odświeżyć stronę.'

/** The names shown folded; the rest is behind "i N innych" (T4-R06). */
export const foldedNames = 3

/**
 * A source's reasons, shown after its name (T4-R04, R05): the day of its
 * latest complete sync or "nigdy", and "3 nieudane z rzędu".
 * ASSUMPTION(oferty-pracy-nq3.4/ASM-1): each source shows its reasons in brackets after its name.
 */
export function warningReasons(warning: HealthWarning): string {
  return warning.reasons
    .map((reason) =>
      reason === 'failing'
        ? '3 nieudane z rzędu'
        : `ostatnia pełna: ${
            warning.latestCompleteAt
              ? formatDate(new Date(warning.latestCompleteAt))
              : 'nigdy'
          }`,
    )
    .join(' · ')
}

/**
 * The names the warning shows (T4-R06): at most 3 while folded, with the
 * text of the rest, or every one once expanded. Null with no source to
 * list: the warning is not shown.
 */
export function shownWarnings(
  warnings: readonly HealthWarning[],
  expanded: boolean,
): { shown: HealthWarning[]; more: string | null } | null {
  if (!warnings.length) return null
  if (expanded || warnings.length <= foldedNames)
    return { shown: [...warnings], more: null }
  return {
    shown: warnings.slice(0, foldedNames),
    more: `i ${warnings.length - foldedNames} innych`,
  }
}

/**
 * The history a click on a name shows (T4-R06): that source, period all,
 * the other filters at their defaults and page 1; the number per page is
 * no filter and stays.
 */
export const warningQuery = (
  query: SyncHistoryQuery,
  source: string,
): SyncHistoryQuery => ({
  ...clearFilters(query),
  sources: [source],
  period: 'all',
})
