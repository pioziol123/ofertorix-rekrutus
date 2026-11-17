import { transaction } from '../../lib/db.ts'
import type { ConnectorProvider } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import { executeStartedRun } from './execute-sync-run.ts'
import { finishStoppedRun, recoverInProcessRuns } from './recover-sync-runs.ts'
import { admitRun, readRun, startRun, type SyncRun } from './sync-run-state.ts'

/** The scope already has an active run; nothing was created or fetched. */
export class SyncRunAlreadyActiveError extends Error {
  override name = 'SyncRunAlreadyActiveError'
  constructor() {
    super('A sync run of this scope is already running')
  }
}

/**
 * Creates a manual run without a queue job and executes it in the calling
 * process with the shared executor, then returns the finished run. Until
 * 0mq.16 queues every source, Himalayas runs this way (A5-R08).
 *
 * The run is created and started together, so a scope with an active run
 * gets an error and no run. Aborting the signal stops the fetch and ends
 * the run as interrupted (F2-13): no queue would retry it. A process that
 * dies leaves the run running; the next call, or a worker's recovery,
 * finishes it once it is older than `inProcessRunLimitSeconds`.
 */
export async function runSyncInProcess(
  request: {
    source: string
    /** Source-specific request the connector derives the scope from. */
    scopeRequest?: unknown
    scheduleDay: string
    signal: AbortSignal
  },
  connectors: ConnectorProvider = sourceConnectors,
): Promise<SyncRun> {
  const connector = connectors.get(request.source)
  const parameters = connector.scopeParameters(request.scopeRequest)
  await recoverInProcessRuns(request.source)
  const run = await transaction(async () => {
    const admitted = await admitRun({
      source: request.source,
      parameters,
      trigger: 'manual',
      scheduleDay: request.scheduleDay,
    })
    if (admitted.existing) throw new SyncRunAlreadyActiveError()
    try {
      return (await startRun(admitted.id))!
    } catch (error) {
      if ((error as { code?: unknown }).code === '23505')
        throw new SyncRunAlreadyActiveError()
      throw error
    }
  })
  const attempt = run.attempt ?? 0
  try {
    await executeStartedRun(
      run,
      { attempt, signal: request.signal },
      connectors,
    )
  } catch (error) {
    if (request.signal.aborted) await finishStoppedRun(run.id, attempt)
    throw error
  }
  return (await readRun(run.id))!
}
