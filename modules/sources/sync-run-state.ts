import { transaction } from '../../lib/db.ts'
import { hash } from './domain/canonical-hash.ts'
import {
  findQueuedRunId,
  findRun,
  findUnfinishedRuns,
  insertQueuedRun,
  markRunFinished,
  markRunStarted,
  setRunJob,
  upsertScope,
} from './infrastructure/persistence/sync-runs.ts'

/**
 * The state of sync runs in one place: admission, start, finish and the reads
 * recovery needs. Internal to the Sources module. Whoever manages a run
 * decides about it (status, error, diagnostics); these operations only guard
 * the allowed transitions and F2-07.
 */

export type RunTrigger = 'manual' | 'scheduled'
export type FinishedRunStatus = 'complete' | 'partial' | 'failed'
export type SyncRunStatus = 'queued' | 'running' | FinishedRunStatus

export type SyncRun = {
  id: string
  scopeId: string
  source: string
  /** Scope parameters fixed at admission (F2-08). */
  parameters: Record<string, unknown>
  trigger: RunTrigger
  /** Schedule day, `YYYY-MM-DD`. */
  scheduleDay: string
  status: SyncRunStatus
  jobId: string | null
  pages: number
  uniqueAds: number
  revisions: number
  error: string | null
  diagnostics: unknown
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

export type RunAdmission = {
  source: string
  /** Normalized scope parameters; their fingerprint identifies the scope. */
  parameters: Record<string, unknown>
  trigger: RunTrigger
  scheduleDay: string
  /**
   * Sends the run's queue job inside the admission's transaction (pg-boss
   * with the shared `db` adapter) and returns the job id, or throws.
   */
  sendJob: (runId: string) => Promise<string>
}

export type AdmittedRun = { id: string; existing: boolean }

// A queued run seen as a conflict can start before it is read back; the
// admission then inserts again, which F2-07 allows once the queued run has
// started. Bounded so a fault cannot loop forever: after the last attempt the
// admission fails, rolls back and the caller may request again.
const admissionAttempts = 3

/**
 * Admits a run for the source and scope (F2-07): returns the scope's queued
 * run if there is one, otherwise creates a queued run and its queue job
 * together. Concurrent admissions are settled by the queued-run index.
 */
export function admitRun(admission: RunAdmission): Promise<AdmittedRun> {
  return transaction(async () => {
    const scopeId = await upsertScope(
      admission.source,
      hash(admission.parameters),
      admission.parameters,
    )
    for (let attempt = 0; attempt < admissionAttempts; attempt++) {
      const id = await insertQueuedRun({
        scopeId,
        trigger: admission.trigger,
        scheduleDay: admission.scheduleDay,
      })
      if (id) {
        await setRunJob(id, await admission.sendJob(id))
        return { id, existing: false }
      }
      const queued = await findQueuedRunId(scopeId)
      if (queued) return { id: queued, existing: true }
    }
    throw new Error('Sync run admission did not settle; retry the request')
  })
}

/**
 * Starts a queued run. Returns null, without changes, when the run is not
 * queued: a redelivered job or a finished run. While another run of the same
 * scope is running it throws the running-run index' unique violation
 * (PostgreSQL code 23505) and the run stays queued: callers read that as
 * "not now", not as a lost run (F2-07).
 */
export function startRun(runId: string): Promise<SyncRun | null> {
  return markRunStarted(runId)
}

/**
 * Finishes a queued or running run with the status the caller chose.
 * Returns false, without changes, when the run had already finished.
 */
export function finishRun(
  runId: string,
  outcome: {
    status: FinishedRunStatus
    error: string | null
    diagnostics?: unknown
  },
): Promise<boolean> {
  return markRunFinished(runId, {
    status: outcome.status,
    error: outcome.error,
    diagnostics: outcome.diagnostics ?? null,
  })
}

/** The run with its scope parameters, or null. */
export function readRun(runId: string): Promise<SyncRun | null> {
  return findRun(runId)
}

/** Queued and running runs, optionally of one source, oldest first. */
export function listUnfinishedRuns(source?: string): Promise<SyncRun[]> {
  return findUnfinishedRuns(source)
}
