import { dayStart } from '../../lib/time/index.ts'
import { sourceName } from './domain/source-names.ts'
import {
  pageCount,
  readHistoryQuery,
  type CatalogSource,
  type SyncDetails,
  type SyncHistoryItem,
  type SyncHistoryPage,
  type SyncPeriod,
} from './domain/sync-history.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import {
  countHistory,
  findHistoryPage,
  findRunDetails,
  findUnavailableCountedSince,
  type HistoryRow,
} from './infrastructure/persistence/sync-history.ts'
import { listUnfinishedRuns } from './sync-run-state.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every catalogue source, in catalogue order (T1-R08), with the id of its
 * unfinished run, if any (T3 approach, item 4).
 */
async function catalog(
  connectors: ConnectorProvider,
): Promise<CatalogSource[]> {
  const unfinished = new Map<string, string>()
  for (const run of await listUnfinishedRuns())
    if (!unfinished.has(run.source)) unfinished.set(run.source, run.id)
  return connectors.names().map((id) => {
    const connector = connectors.get(id)
    return {
      id,
      name: sourceName(id),
      // ASSUMPTION(oferty-pracy-0mq.16/ASM-4): the connector answers it from the source's configuration.
      enabled: connector.enabled(),
      marksUnavailable: connector.infersUnavailabilityFromAbsence,
      unfinishedRun: unfinished.get(id) ?? null,
    }
  })
}

/**
 * The first moment of the period: today and the 6 or 29 Polish calendar
 * days before it, or none (T1-R08).
 */
function periodStart(period: SyncPeriod, now: Date): Date | null {
  if (period === 'all') return null
  return dayStart(now, { today: 0, '7d': 6, '30d': 29 }[period])
}

/** Changed ads: new content versions less new ads, never below 0 (PS-D02). */
function toItem(row: HistoryRow): SyncHistoryItem {
  return {
    id: row.id,
    source: row.source,
    trigger: row.trigger,
    status: row.status,
    requestedAt: row.created_at.toISOString(),
    seen: row.seen,
    newAds: row.new_ads,
    changedAds:
      row.new_ads === null ? null : Math.max(0, row.revisions - row.new_ads),
    markedUnavailable: row.marked_unavailable,
  }
}

/**
 * One page of the sync history (T1-R02–R10, R17): every stored sync of
 * every catalogue source matching the filters, latest requested first.
 * Takes the page's address as it came; values it cannot read give their
 * defaults, and a page beyond the last gives the last. It also gives the
 * moment since which complete syncs record how many ads they marked
 * unavailable (T2-R04). Reads committed
 * state; a sync ending during the read shows its earlier or later state.
 */
export async function readSyncHistory(
  address: Record<string, unknown>,
  now: Date = new Date(),
  /** Tests replace the application's connectors. */
  connectors: ConnectorProvider = sourceConnectors,
): Promise<SyncHistoryPage> {
  const sources = await catalog(connectors)
  const query = readHistoryQuery(
    address,
    sources.map((source) => source.id),
  )
  const filter = {
    sources: query.sources,
    states: query.states,
    trigger: query.trigger,
    requestedFrom: periodStart(query.period, now),
  }
  const total = await countHistory(filter)
  const pages = pageCount(total, query.size)
  const page = Math.min(query.page, pages)
  const rows = await findHistoryPage(filter, {
    limit: query.size,
    offset: (page - 1) * query.size,
  })
  const countedSince = await findUnavailableCountedSince()
  return {
    items: rows.map(toItem),
    total,
    page,
    pages,
    size: query.size,
    filters: {
      sources: query.sources,
      states: query.states,
      trigger: query.trigger,
      period: query.period,
    },
    sources,
    unavailableCountedSince: countedSince?.toISOString() ?? null,
  }
}

/**
 * One sync's details (T1-R12–R15) with its course, the stored error and
 * the diagnostics as stored. Null for an unknown or malformed id (T1-R16).
 */
export async function readSyncDetails(
  runId: string,
): Promise<SyncDetails | null> {
  if (!uuid.test(runId)) return null
  const row = await findRunDetails(runId)
  if (!row) return null
  return {
    ...toItem(row),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    pages: row.pages,
    error: row.error,
    diagnostics: row.diagnostics ?? null,
  }
}
