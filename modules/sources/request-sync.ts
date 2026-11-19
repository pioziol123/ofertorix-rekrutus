import { currentScheduleDay } from './schedule-settings.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import { sendSyncJob } from './infrastructure/worker/sync-queue.ts'
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
 * starts a sync (F2-10): the CLI, the application and the schedule. The run
 * and its job in the sync queue are created together (F2-07): the scope's
 * pending run is pointed at instead of creating another one, and a run in
 * progress is never interrupted. The scope's settings are fixed now (F2-08).
 *
 * Returns the run id at once, without waiting for the run, and whether an
 * existing run was pointed at. Throws `UnknownConnectorError` for an
 * unknown source, `SourceDisabledError` for a disabled one and the
 * connector's error for an invalid scope request, creating nothing. Throws
 * `AdmittedRunFinishedError` when the run it met finished meanwhile; the
 * caller may request again.
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
    sendJob: (runId) => sendSyncJob({ id: runId, source: connector.name }),
  })
}
