import { hash } from './domain/canonical-hash.ts'
import { jobspyCatalog, jobspySources } from './domain/jobspy-catalog.ts'
import { polishCatalog, polishSources } from './domain/polish-catalog.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import {
  findLatestCompleteRun,
  findLatestRunRecord,
  type RunRecord,
} from './infrastructure/persistence/sync-runs.ts'

export type { RunRecord as SyncRunRecord }

/** The sync state of one source, in the form the status reads have always had. */
export type SourceSyncState = {
  enabled: boolean
  scheduled: boolean
  /** The run asked for, or the latest run; null when there is none. */
  run: RunRecord | null
  lastComplete: { id: string; finished_at: Date } | null
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The sync state of a source (A16-R06): whether it is enabled and
 * scheduled, a run by its id or the latest run, and the latest complete
 * run. Without a scope request the runs are those of the whole source;
 * with one, the scope's (`scope: {}` reads the scope of a source with a
 * fixed scope), and the run carries its scope parameters. A run id of
 * another source or scope reads as no run. Throws for an unknown source
 * and for a run id that is not a UUID.
 */
export async function readSyncState(
  query: {
    source: string
    runId?: string
    scope?: { request?: unknown }
  },
  /** Tests replace the application's connectors. */
  connectors: ConnectorProvider = sourceConnectors,
): Promise<SourceSyncState> {
  if (query.runId !== undefined && !uuid.test(query.runId))
    throw new Error('Invalid run UUID')
  const connector = connectors.get(query.source)
  const filter = {
    source: connector.name,
    fingerprint: query.scope
      ? hash(connector.scopeParameters(query.scope.request))
      : undefined,
  }
  const [run, lastComplete] = await Promise.all([
    findLatestRunRecord({ ...filter, runId: query.runId }),
    findLatestCompleteRun(filter),
  ])
  return {
    // ASSUMPTION(oferty-pracy-0mq.16/ASM-4): both come from the source's connector.
    enabled: connector.enabled(),
    scheduled: connector.scheduled,
    run,
    lastComplete,
  }
}

type CatalogEntryState = Pick<SourceSyncState, 'enabled' | 'scheduled' | 'run'>

const entryState = async (source: string): Promise<CatalogEntryState> => {
  const { enabled, scheduled, run } = await readSyncState({ source })
  return { enabled, scheduled, run }
}

/**
 * The state of the source catalogue (A16-R06): every JobSpy portal and
 * every Polish portal with its catalogue data, whether it is connected and
 * its latest run, in the form the catalogue reads have always had. Indeed
 * also gives the JobSpy part its top-level state.
 */
export async function readSourceCatalog() {
  const [jobspy, polish] = await Promise.all([
    Promise.all(
      jobspySources.map(async (source) => ({
        source,
        ...jobspyCatalog[source],
        connected: source !== 'google',
        ...(await entryState(source)),
      })),
    ),
    Promise.all(
      polishSources.map(async (source) => ({
        source,
        ...polishCatalog[source],
        connected: true,
        ...(await entryState(source)),
      })),
    ),
  ])
  const indeed = jobspy.find((s) => s.source === 'indeed')!
  return {
    jobspy: {
      enabled: indeed.enabled,
      scheduled: indeed.scheduled,
      run: indeed.run,
      sources: jobspy,
    },
    polish: { scheduled: polish.some((s) => s.scheduled), sources: polish },
  }
}
