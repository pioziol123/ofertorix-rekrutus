import { transaction } from '../../lib/db.ts'
import { finishedRunStatus } from './domain/run-status.ts'
import {
  ConnectorAbortedError,
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
import { markAbsentAdsUnavailable } from './mark-absent-ads-unavailable.ts'
import { saveBatch } from './save-batch.ts'
import {
  findSyncJob,
  type SyncJobLookup,
} from './infrastructure/worker/sync-queue.ts'
import { startInSourceTurn } from './start-in-source-turn.ts'
import {
  finishRun,
  holdRun,
  type RunAttempt,
  type SyncRun,
} from './sync-run-state.ts'

/** The work of one queue attempt on a run. */
export type SyncRunWork = RunAttempt & {
  runId: string
  /** Aborted when the attempt must stop: lost claim, expiry, shutdown. */
  signal: AbortSignal
}

/**
 * The attempt no longer holds the run: a later attempt took it over or the
 * run was finished, e.g. by recovery. The attempt stops without writing.
 */
export class SyncRunLostError extends Error {
  override name = 'SyncRunLostError'
  constructor(runId: string) {
    super(`Sync run ${runId} is no longer held by this attempt`)
  }
}

// Stored when an error's message may hold secrets or raw source responses.
const genericFailure = 'Import interrupted by a storage or processing error'

/**
 * Executes a sync run of any source (F2-01): takes the run over for the
 * attempt, fetches the scope saved at admission through the source's
 * connector, saves each batch and finishes the run with the status A5-R03
 * gives. Nothing here depends on a concrete source.
 *
 * Returns without changes when the attempt cannot take the run: a
 * redelivered attempt or a finished run. Throws, without writing further,
 * when the signal is aborted or the attempt lost the run, so the queue
 * decides whether to retry; a retry continues the same run (F2-13).
 *
 * The one way a run is started: the sync queue's handler calls it for every
 * job. Internal to the module.
 */
export async function executeSyncRun(
  work: SyncRunWork,
  connectors: ConnectorProvider = sourceConnectors,
  /** Where the jobs of runs ahead are looked up; tests use their own queue. */
  findJob: SyncJobLookup = findSyncJob,
): Promise<void> {
  // ASSUMPTION(oferty-pracy-0mq.16/ASM-3): the run starts, or a later
  // attempt takes it over, only in its source's turn.
  const run = await startInSourceTurn(work, findJob)
  if (!run) return
  await executeStartedRun(run, work, connectors)
}

/** Executes a run its attempt has just started or taken over. */
async function executeStartedRun(
  run: SyncRun,
  work: Pick<SyncRunWork, 'attempt' | 'signal'>,
  connectors: ConnectorProvider,
): Promise<void> {
  const held = { runId: run.id, attempt: work.attempt }
  let connector: SourceConnector
  try {
    connector = connectors.get(run.source)
  } catch (error) {
    if (!(error instanceof UnknownConnectorError)) throw error
    await finish(held, run, null, {
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
            await requireHeld(held)
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
      work.signal,
    )
  } catch (error) {
    if (
      error instanceof SyncRunLostError ||
      error instanceof ConnectorAbortedError ||
      work.signal.aborted
    )
      throw error
    // Only connector errors are safe to store; never credentials or raw
    // responses (A5-R04).
    await finish(held, run, connector, {
      sourceComplete: false,
      saveFailed,
      error: error instanceof ConnectorError ? error.message : genericFailure,
    })
    return
  }
  await finish(held, run, connector, {
    sourceComplete: result.complete,
    saveFailed,
    error: result.complete ? genericFailure : result.reason,
    diagnostics: result.diagnostics,
  })
}

type HeldRun = { runId: string; attempt: number }

async function requireHeld(held: HeldRun): Promise<SyncRun> {
  const run = await holdRun(held.runId, held.attempt)
  if (!run) throw new SyncRunLostError(held.runId)
  return run
}

/**
 * Finishes the run while the attempt holds it, with the status A5-R03
 * gives. A complete run marks unavailability in the same transaction, so
 * both commit together or not at all.
 */
async function finish(
  held: HeldRun,
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
    const current = await requireHeld(held)
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
    const finished = await finishRun(
      held.runId,
      {
        status,
        error: status === 'complete' ? null : outcome.error,
        diagnostics: outcome.diagnostics,
      },
      held.attempt,
    )
    if (!finished) throw new SyncRunLostError(held.runId)
  })
}
