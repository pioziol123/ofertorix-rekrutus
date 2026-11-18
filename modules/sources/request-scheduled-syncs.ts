import { transaction } from '../../lib/db.ts'
import { scheduleDay } from '../../lib/sources/solid.ts'
import { hash } from './domain/canonical-hash.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import {
  hasScheduledRun,
  lockScheduleOccurrence,
} from './infrastructure/persistence/sync-runs.ts'
import { requestSync } from './request-sync.ts'
import { AdmittedRunFinishedError, type AdmittedRun } from './sync-run-state.ts'

/**
 * Requests the sync of every enabled scheduled source once per schedule
 * occurrence: the source and the schedule day, which starts at the
 * configured hour in Europe/Warsaw (A16-R03). Checking an occurrence again,
 * also from several workers at once, requests nothing more: the check and
 * the request hold the occurrence's transaction lock. Only a run the
 * schedule requested counts; a manual run of the same day does not hold the
 * schedule back. Runs do not expire and fetching again on the same day is
 * allowed (F2-09).
 *
 * Returns the request of each source that was requested now. A request
 * that met a run finishing at that moment is left to the next check.
 */
export async function requestScheduledSyncs(
  options: {
    /** Tests replace the application's connectors. */
    connectors?: ConnectorProvider
    now?: Date
  } = {},
): Promise<AdmittedRun[]> {
  const connectors = options.connectors ?? sourceConnectors
  const day = scheduleDay(options.now)
  const requested: AdmittedRun[] = []
  for (const name of connectors.names()) {
    const connector = connectors.get(name)
    // ASSUMPTION(oferty-pracy-0mq.16/ASM-4): the connector declares whether its source is scheduled.
    if (!connector.scheduled || !connector.enabled()) continue
    const run = await transaction(async (): Promise<AdmittedRun | null> => {
      await lockScheduleOccurrence(name, day)
      const fingerprint = hash(connector.scopeParameters())
      if (await hasScheduledRun(fingerprint, day)) return null
      // ASSUMPTION(oferty-pracy-0mq.16/ASM-1): a request pointed at the
      // scope's pending manual run (F2-07) leaves no scheduled run, so a
      // later check of the occurrence requests again; it creates a run only
      // once that pending run has started.
      return requestSync(
        { source: name, trigger: 'scheduled' },
        { connectors, now: options.now },
      )
    }).catch((error: unknown) => {
      // The run the request met finished meanwhile and nothing was created;
      // the next cycle checks the occurrence again.
      if (error instanceof AdmittedRunFinishedError) return null
      throw error
    })
    if (run) requested.push(run)
  }
  return requested
}
