import { addHours } from '../../../lib/time/index.ts'
import type { FinishedRunStatus } from './run-states.ts'

/**
 * Source health (T4): the summary strip above the history and the warning
 * about sources not checked in full for days or failing in a row. The
 * thresholds are fixed here and nowhere else (T4-R08). Pure: the read
 * passes the stored facts and the moment of the read.
 */

/** A source is listed when its latest complete sync is older (T4-R04). */
export const staleAfterHours = 72
/** A source is listed after this many failed syncs in a row (T4-R05). */
export const failedInRow = 3
/** "Nowe w 24 h" sums the syncs finished within this window (T4-R03). */
export const newWindowHours = 24

/** Why a source is in the warning list. */
export type HealthReason = 'no-complete' | 'failing'

/** One source of the warning list; moments are ISO text in UTC. */
export type HealthWarning = {
  source: string
  name: string
  /** The finish of its latest complete sync, or null when it had none. */
  latestCompleteAt: string | null
  /** In the order of T4-R04, then T4-R05. */
  reasons: HealthReason[]
}

/** The answer of the health read (T4 contract). */
export type SourceHealth = {
  /** Unfinished syncs of every catalogue source (T4-R01). */
  unfinished: number
  /** Enabled sources whose latest finished sync is Niepełna or Nieudana (T4-R02). */
  latestProblem: number
  /** New ads of the syncs finished in the last 24 hours (T4-R03). */
  newIn24h: number
  /** Enabled sources to warn about, alphabetically by name (T4-R06). */
  warnings: HealthWarning[]
}

/** What the read knows of one enabled source. */
export type SourceRunFacts = {
  source: string
  name: string
  latestCompleteAt: Date | null
  /** Its latest finished syncs, latest first; at most `failedInRow`. */
  latestFinished: FinishedRunStatus[]
}

/** The moment from which syncs count in "Nowe w 24 h". */
export const newWindowStart = (now: Date): Date =>
  addHours(now, -newWindowHours)

/** Complete syncs finished before this moment do not count (T4-R04). */
export const staleBefore = (now: Date): Date => addHours(now, -staleAfterHours)

/** The reasons to list a source, empty when there is none (T4-R04, R05). */
export function healthReasons(
  facts: SourceRunFacts,
  now: Date,
): HealthReason[] {
  const reasons: HealthReason[] = []
  if (!facts.latestCompleteAt || facts.latestCompleteAt < staleBefore(now))
    reasons.push('no-complete')
  if (
    facts.latestFinished.length >= failedInRow &&
    facts.latestFinished
      .slice(0, failedInRow)
      .every((status) => status === 'failed')
  )
    reasons.push('failing')
  return reasons
}

/**
 * The count of T4-R02 and the warning list of T4-R04–R06 for the enabled
 * sources; the caller leaves disabled sources out (T4-R08).
 */
export function sourceWarnings(
  enabled: readonly SourceRunFacts[],
  now: Date,
): Pick<SourceHealth, 'latestProblem' | 'warnings'> {
  const latestProblem = enabled.filter(
    (facts) =>
      facts.latestFinished[0] === 'partial' ||
      facts.latestFinished[0] === 'failed',
  ).length
  const warnings = enabled
    .map((facts) => ({
      source: facts.source,
      name: facts.name,
      latestCompleteAt: facts.latestCompleteAt?.toISOString() ?? null,
      reasons: healthReasons(facts, now),
    }))
    .filter((warning) => warning.reasons.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'pl') || compare(a, b))
  return { latestProblem, warnings }
}

const compare = (a: HealthWarning, b: HealthWarning) =>
  a.source < b.source ? -1 : a.source > b.source ? 1 : 0
