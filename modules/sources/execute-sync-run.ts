import { transaction } from '../../lib/db.ts'
import { sendJob } from '../../lib/queues/index.ts'
import { finishedRunStatus } from './domain/run-status.ts'
import {
  ConnectorError,
  type ConnectorDiagnostics,
  type ConnectorResult,
  type SourceConnector,
} from './infrastructure/adapters/connector.ts'
import {
  UnknownConnectorError,
  type ConnectorProvider,
} from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import {
  syncJob,
  type SyncJobData,
} from './infrastructure/worker/sync-queue.ts'
import { markAbsentAdsUnavailable } from './mark-absent-ads-unavailable.ts'
import { saveBatch } from './save-batch.ts'
import {
  finishRun,
  holdRun,
  listUnfinishedRuns,
  readRun,
  startRun,
  type SyncRun,
} from './sync-run-state.ts'

/**
 * The run is no longer running: it was finished meanwhile. The attempt
 * stops without writing.
 */
export class SyncRunLostError extends Error {
  override name = 'SyncRunLostError'
  constructor(runId: string) {
    super(`Sync run ${runId} is no longer running`)
  }
}

// Stored when an error's message may hold secrets or raw source responses.
const genericFailure = 'Import interrupted by a storage or processing error'

/** What a run whose last attempt failed is finished with (B5-R05). */
export const interruptedMessage = 'Worker interrupted; request a new import'

/**
 * The job handler of a sync run (B5-R03, B5-R04), for every source (F2-01):
 * moves the run from queued, or from running left by an ended or lost
 * attempt, to running in one conditional write, fetches the scope saved at
 * admission through the source's connector, saves each batch and finishes
 * the run with the status A5-R03 gives. A run taken over keeps the ads saved
 * before. Exclusivity by source lets no other attempt of the source run
 * meanwhile (B5-D02), so taking over cannot overlap the previous attempt.
 *
 * A finished run or an unknown id changes nothing. Each batch save and the
 * finish happen only while the run is still running; a run finished
 * meanwhile saves nothing more and the job ends. Any other error fails the
 * attempt, and the next attempt continues the same run.
 */
export async function executeSyncRun(
  { runId }: Pick<SyncJobData, 'runId'>,
  /** Tests replace the application's connectors. */
  connectors: ConnectorProvider = sourceConnectors,
): Promise<void> {
  const run = await startRun(runId)
  if (!run) return
  try {
    await executeStartedRun(run, connectors)
  } catch (error) {
    if (error instanceof SyncRunLostError) return
    throw error
  }
}

/**
 * The failure handler of a sync run, called after the last attempt failed,
 * whatever ended it, also when the worker died in it (B5-R05, B1-D10):
 * finishes a queued or running run as partial when it saved at least one
 * ad and as failed otherwise, with `interruptedMessage`. A finished run is
 * not changed, so a repeat has no further effect.
 */
export async function endFailedSyncRun({
  runId,
}: Pick<SyncJobData, 'runId'>): Promise<void> {
  const run = await readRun(runId)
  if (!run || (run.status !== 'queued' && run.status !== 'running')) return
  // Nothing else carries the run out once its job failed finally, so its
  // count of saved ads no longer changes.
  await finishRun(
    run.id,
    {
      status: finishedRunStatus({
        sourceComplete: false,
        saveFailed: false,
        uniqueAds: run.uniqueAds,
      }),
      error: interruptedMessage,
    },
    ['queued', 'running'],
  )
}

/**
 * Requests one sync job in the queue library for every queued or running
 * run (B5-R08): a queued one is carried out, a running one taken over. The
 * migration step calls it once, while the queue of the former path still
 * exists. Running runs first, then the oldest first, each in its own
 * transaction, so the queue hands the jobs of one source out in that order
 * and a run left pending next to a running run of its scope waits for it.
 * ASSUMPTION(oferty-pracy-2ba.5/ASM-1): the running run of a source with
 * several unfinished runs requested before B5 goes first.
 * Returns how many.
 */
export async function requestUnfinishedSyncRuns(): Promise<number> {
  const runs = await listUnfinishedRuns()
  const ordered = [
    ...runs.filter((run) => run.status === 'running'),
    ...runs.filter((run) => run.status !== 'running'),
  ]
  for (const run of ordered)
    await transaction(() =>
      sendJob(syncJob, { runId: run.id, source: run.source }),
    )
  return ordered.length
}

/** Executes a run its attempt has just started or taken over. */
async function executeStartedRun(
  run: SyncRun,
  connectors: ConnectorProvider,
): Promise<void> {
  let connector: SourceConnector
  try {
    connector = connectors.get(run.source)
  } catch (error) {
    if (!(error instanceof UnknownConnectorError)) throw error
    await finish(run, null, {
      sourceComplete: false,
      error: error.message,
    })
    return
  }
  let saveFailed = false
  let result: ConnectorResult
  try {
    result = await connector.fetch(
      run.parameters,
      async (ads) => {
        try {
          await transaction(async () => {
            await requireRunning(run.id)
            await saveBatch(
              { id: run.id, scopeId: run.scopeId, source: run.source },
              ads,
            )
          })
        } catch (error) {
          if (!(error instanceof SyncRunLostError)) saveFailed = true
          throw error
        }
      },
      // The fetch is not aborted from here: the worker ends the process
      // carrying out the attempt instead (B1-D09).
      new AbortController().signal,
    )
  } catch (error) {
    if (error instanceof SyncRunLostError) throw error
    // Only connector errors are safe to store; never credentials or raw
    // responses (A5-R04).
    await finish(run, connector, {
      sourceComplete: false,
      saveFailed,
      error: error instanceof ConnectorError ? error.message : genericFailure,
    })
    return
  }
  await finish(run, connector, {
    sourceComplete: result.complete,
    saveFailed,
    error: result.complete ? genericFailure : result.reason,
    diagnostics: result.diagnostics,
  })
}

async function requireRunning(runId: string): Promise<SyncRun> {
  const run = await holdRun(runId)
  if (!run) throw new SyncRunLostError(runId)
  return run
}

/**
 * Finishes the run while it is still running, with the status A5-R03
 * gives. A complete run marks unavailability in the same transaction, so
 * both commit together or not at all.
 */
async function finish(
  run: SyncRun,
  connector: SourceConnector | null,
  outcome: {
    sourceComplete: boolean
    saveFailed?: boolean
    /** Stored unless the run completes; safe to store. */
    error: string
    diagnostics?: ConnectorDiagnostics
  },
): Promise<void> {
  await transaction(async () => {
    const current = await requireRunning(run.id)
    const status = finishedRunStatus({
      sourceComplete: outcome.sourceComplete,
      saveFailed: outcome.saveFailed ?? false,
      uniqueAds: current.uniqueAds,
    })
    if (status === 'complete' && connector)
      await markAbsentAdsUnavailable({
        runId: run.id,
        scopeId: run.scopeId,
        source: run.source,
        infersUnavailabilityFromAbsence:
          connector.infersUnavailabilityFromAbsence,
      })
    await finishRun(
      run.id,
      {
        status,
        error: status === 'complete' ? null : outcome.error,
        diagnostics: outcome.diagnostics,
      },
      ['running'],
    )
  })
}
