import {
  countOutcomes,
  panelScopeRequest,
  type PanelSyncOutcome,
  type PanelSyncResult,
} from './domain/panel-syncs.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import { requestSync, SourceDisabledError } from './request-sync.ts'

/** An empty list of sources, or one longer than the catalogue. */
export class InvalidPanelSyncRequestError extends Error {
  override name = 'InvalidPanelSyncRequestError'
}

/**
 * Requests syncs of the given sources from the page "Synchronizacje" (T3):
 * each in the panel's fixed scope, PHP · senior (T3-R03), started manually
 * (T3-R09), through the one request of every entry point, so a source with
 * an unfinished run gets no second one and its run counts as already
 * running, also when that run was admitted after the page read the
 * sources (T3-R04). A disabled source or one the catalogue does not know
 * is skipped (T3-R05); any other failure, the queue's refusal included,
 * leaves the source not requested with nothing stored for it (T3-R06).
 * Sources are handled one by one and independently, each in its own
 * transaction, so no outcome undoes or blocks another.
 *
 * Takes each source once. Throws `InvalidPanelSyncRequestError` for an
 * empty list or one with more sources than the catalogue, creating
 * nothing.
 */
export async function requestPanelSyncs(
  sources: readonly string[],
  options: {
    /** Tests replace the application's connectors. */
    connectors?: ConnectorProvider
    now?: Date
  } = {},
): Promise<PanelSyncResult> {
  const connectors = options.connectors ?? sourceConnectors
  const unique = [...new Set(sources)]
  if (!unique.length || unique.length > connectors.names().length)
    throw new InvalidPanelSyncRequestError(
      `Expected 1 to ${connectors.names().length} sources, got ${unique.length}`,
    )
  const outcomes: PanelSyncOutcome[] = []
  for (const source of unique)
    outcomes.push(await requestOne(source, connectors, options.now))
  return { outcomes, counts: countOutcomes(outcomes) }
}

async function requestOne(
  source: string,
  connectors: ConnectorProvider,
  now: Date | undefined,
): Promise<PanelSyncOutcome> {
  if (!connectors.names().includes(source))
    return { source, outcome: 'skipped' }
  try {
    const run = await requestSync(
      {
        source,
        scopeRequest: panelScopeRequest(source),
        trigger: 'manual',
      },
      { connectors, now },
    )
    return run.existing
      ? { source, outcome: 'already-running', runId: run.id }
      : { source, outcome: 'requested', runId: run.id }
  } catch (error) {
    if (error instanceof SourceDisabledError)
      return { source, outcome: 'skipped' }
    return { source, outcome: 'not-requested' }
  }
}
