import { transaction } from '../../lib/db.ts'
import { currentScheduleDay } from './schedule-settings.ts'
import { hash } from './domain/canonical-hash.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import {
  hasScheduledRun,
  lockScheduleOccurrence,
} from './infrastructure/persistence/sync-runs.ts'
import { requestSync } from './request-sync.ts'
import type { AdmittedRun } from './sync-run-state.ts'

/**
 * Requests the sync of every enabled scheduled source once per schedule
 * occurrence: the source and the schedule day, which starts at the
 * configured hour in Polish time (A16-R03). Checking an occurrence again,
 * also from several workers at once, requests nothing more: the check and
 * the request hold the occurrence's transaction lock. Only a run the
 * schedule requested counts; a manual run of the same day does not hold the
 * schedule back. Runs do not expire and fetching again on the same day is
 * allowed (F2-09).
 *
 * Each source is requested through the request of B5-R01 and B5-R02, so a
 * source with an unfinished run, manual or scheduled, gets no second one
 * (B5-R07). Returns the run of each source that was created now.
 */
export async function requestScheduledSyncs(
  options: {
    /** Tests replace the application's connectors. */
    connectors?: ConnectorProvider
    now?: Date
  } = {},
): Promise<AdmittedRun[]> {
  const connectors = options.connectors ?? sourceConnectors
  const day = currentScheduleDay(options.now)
  const requested: AdmittedRun[] = []
  for (const name of connectors.names()) {
    const connector = connectors.get(name)
    // ASSUMPTION(oferty-pracy-0mq.16/ASM-4): the connector declares whether its source is scheduled.
    if (!connector.scheduled || !connector.enabled()) continue
    const run = await transaction(async (): Promise<AdmittedRun | null> => {
      await lockScheduleOccurrence(name, day)
      const fingerprint = hash(connector.scopeParameters())
      if (await hasScheduledRun(fingerprint, day)) return null
      // ASSUMPTION(oferty-pracy-0mq.16/ASM-1): a request that met the
      // source's unfinished manual run (B5-R02) leaves no scheduled run, so
      // a later check of the occurrence requests again; it creates a run
      // only once that run has finished.
      return requestSync(
        { source: name, trigger: 'scheduled' },
        { connectors, now: options.now },
      )
    })
    if (run && !run.existing) requested.push(run)
  }
  return requested
}
