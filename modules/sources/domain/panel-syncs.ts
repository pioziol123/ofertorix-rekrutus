import { polishSources } from './polish-catalog.ts'

/**
 * Requesting syncs from the page "Synchronizacje" (T3): the panel's fixed
 * scope and the outcome of a request. Pure, so the page reads the outcome's
 * types through the module's view entry.
 */

/** Every sync requested from the panel searches PHP · senior (T3-R03). */
export const panelScope = Object.freeze({
  technology: 'PHP',
  seniority: 'senior',
} as const)

/**
 * The scope input of the panel's request for a source. A Polish portal
 * takes the panel's technology and level and keeps its present limits,
 * the defaults of its scope input (T3-R03); the other sources search the
 * panel's scope by default and take no input.
 */
export function panelScopeRequest(
  source: string,
): { source: string; technology: string; seniority: string } | undefined {
  return (polishSources as readonly string[]).includes(source)
    ? { source, ...panelScope }
    : undefined
}

/**
 * The outcome of one source (T3 approach, item 2): a new run, the source's
 * unfinished run, skipped (disabled or not in the catalogue, T3-R05) or not
 * requested (any other failure, the queue's refusal included, T3-R06).
 */
export type PanelSyncOutcome =
  | { source: string; outcome: 'requested'; runId: string }
  | { source: string; outcome: 'already-running'; runId: string }
  | { source: string; outcome: 'skipped' }
  | { source: string; outcome: 'not-requested' }

export type PanelSyncCounts = {
  requested: number
  alreadyRunning: number
  skipped: number
  notRequested: number
}

/** The answer of a request from the panel: each source and the counts. */
export type PanelSyncResult = {
  outcomes: PanelSyncOutcome[]
  counts: PanelSyncCounts
}

/** The counts of each outcome. */
export function countOutcomes(
  outcomes: readonly PanelSyncOutcome[],
): PanelSyncCounts {
  const count = (outcome: PanelSyncOutcome['outcome']) =>
    outcomes.filter((entry) => entry.outcome === outcome).length
  return {
    requested: count('requested'),
    alreadyRunning: count('already-running'),
    skipped: count('skipped'),
    notRequested: count('not-requested'),
  }
}
