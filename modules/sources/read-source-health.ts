import { sourceName } from './domain/source-names.ts'
import {
  newWindowStart,
  sourceWarnings,
  type SourceHealth,
} from './domain/source-health.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import {
  countUnfinishedRuns,
  findSourceRuns,
  sumNewAdsFinishedSince,
} from './infrastructure/persistence/source-health.ts'

/**
 * The summary strip and the warning of the page "Synchronizacje" (T4):
 * unfinished syncs and new ads of the last 24 hours of every catalogue
 * source, and, for enabled sources only (T4-R08), the count of those whose
 * latest finished sync is Niepełna or Nieudana and the sources without a
 * complete sync for 72 hours or with 3 failed in a row. It takes no
 * history filter (T4-R07) and computes everything from the stored runs at
 * each call. Reads committed state; a sync ending during the read shows
 * its earlier or later state.
 */
export async function readSourceHealth(
  now: Date = new Date(),
  /** Tests replace the application's connectors. */
  connectors: ConnectorProvider = sourceConnectors,
): Promise<SourceHealth> {
  const catalog = connectors.names()
  const enabled = catalog.filter((id) =>
    // ASSUMPTION(oferty-pracy-0mq.16/ASM-4): the connector answers it from the source's configuration.
    connectors.get(id).enabled(),
  )
  const unfinished = await countUnfinishedRuns(catalog)
  const newIn24h = await sumNewAdsFinishedSince(catalog, newWindowStart(now))
  const runs = await findSourceRuns(enabled)
  const facts = runs.map((row) => ({
    source: row.source,
    name: sourceName(row.source),
    latestCompleteAt: row.latest_complete_at,
    latestFinished: row.latest_finished,
  }))
  return { unfinished, newIn24h, ...sourceWarnings(facts, now) }
}
