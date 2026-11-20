import { currentScheduleDay } from './schedule-settings.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import { sendJob } from '../../lib/queues/index.ts'
import { syncJob } from './infrastructure/worker/sync-queue.ts'
import {
  admitRun,
  type AdmittedRun,
  type RunTrigger,
} from './sync-run-state.ts'

/** Configuration does not allow requesting the source; nothing was created. */
export class SourceDisabledError extends Error {
  override name = 'SourceDisabledError'
  constructor(public readonly sourceName: string) {
    super(`Source is disabled: ${sourceName}`)
  }
}

export type SyncRequest = {
  /** The source's stable name. */
  source: string
  /**
   * Source-specific input the connector derives the scope from, e.g. the
   * query of a Polish portal; sources with a fixed scope ignore it.
   */
  scopeRequest?: unknown
  /** Manual unless the schedule requests. */
  trigger?: RunTrigger
}

/**
 * Requests a sync of the source's scope, the one way every entry point
 * starts a sync (B5-R01): the CLI, the application and the schedule. When
 * the source has a queued or running run, of any scope, it creates nothing
 * and returns that run as existing (B5-R02). Otherwise it creates a queued
 * run and requests its job in the queue library in one transaction. The
 * scope's settings are fixed now (F2-08).
 *
 * Returns the run id at once, without waiting for the run, and whether an
 * existing run was returned. Throws `UnknownConnectorError` for an unknown
 * source, `SourceDisabledError` for a disabled one and the connector's
 * error for invalid sync settings, creating nothing.
 */
export async function requestSync(
  request: SyncRequest,
  options: {
    /** Tests replace the application's connectors. */
    connectors?: ConnectorProvider
    now?: Date
  } = {},
): Promise<AdmittedRun> {
  const connector = (options.connectors ?? sourceConnectors).get(request.source)
  // ASSUMPTION(oferty-pracy-0mq.16/ASM-4): whether the source is enabled comes from its connector.
  if (!connector.enabled()) throw new SourceDisabledError(connector.name)
  const parameters = connector.scopeParameters(request.scopeRequest)
  return admitRun({
    source: connector.name,
    parameters,
    trigger: request.trigger ?? 'manual',
    scheduleDay: currentScheduleDay(options.now),
    sendJob: (runId) => sendJob(syncJob, { runId, source: connector.name }),
  })
}
