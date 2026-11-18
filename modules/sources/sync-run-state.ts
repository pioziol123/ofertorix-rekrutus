import { transaction } from '../../lib/db.ts'
import { hash } from './domain/canonical-hash.ts'
import {
  findBlockingRunId,
  findRun,
  findUnfinishedRuns,
  insertQueuedRun,
  lockHeldRun,
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
  /** The queue attempt holding the run since it started. */
  attempt: number | null
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
   * Without it the run has no queue job: the requesting process executes it
   * itself.
   */
  sendJob?: (runId: string) => Promise<string>
}

export type AdmittedRun = { id: string; existing: boolean }

/** The run an admission met has finished; nothing was created. */
export class AdmittedRunFinishedError extends Error {
  override name = 'AdmittedRunFinishedError'
  constructor() {
    super('The sync run this request met has already finished; request again')
  }
}

/**
 * Admits a run for the source and scope (F2-07): returns the scope's queued
 * run if there is one, otherwise creates a queued run and its queue job
 * together. Concurrent admissions are settled by the queued-run index.
 *
 * One insert attempt only: when the index rejects it, the run that blocked
 * it is returned as existing, also when it has started since. When that run
 * has already finished, the admission throws `AdmittedRunFinishedError` and
 * rolls back; the caller may request again.
 */
export function admitRun(admission: RunAdmission): Promise<AdmittedRun> {
  return transaction(async () => {
    const scopeId = await upsertScope(
      admission.source,
      hash(admission.parameters),
      admission.parameters,
    )
    const inserted = await insertQueuedRun({
      scopeId,
      trigger: admission.trigger,
      scheduleDay: admission.scheduleDay,
    })
    if (inserted.id) {
      const id = inserted.id
      if (admission.sendJob) await setRunJob(id, await admission.sendJob(id))
      return { id, existing: false }
    }
    // ASSUMPTION(oferty-pracy-0mq.19/ASM-1): the scope's run that was
    // already running before the insert did not block it and is never
    // returned in place of the blocking run.
    const blocking = await findBlockingRunId(scopeId, inserted.runningBefore)
    if (blocking) return { id: blocking, existing: true }
    throw new AdmittedRunFinishedError()
  })
}

/** The queue job and its attempt that execute a run (F2-13). */
export type RunAttempt = {
  /** The run's queue job; null for a run executed without a queue. */
  jobId: string | null
  /** The job's retry count: 0 for the first attempt. */
  attempt: number
}

/**
 * Starts a queued run under the attempt, or hands a running run over to a
 * later attempt of its own queue job: the run continues instead of a new one
 * (F2-13). Returns null, without changes, otherwise: a redelivered attempt or
 * a finished run. While another run of the same scope is running a queued
 * run throws the running-run index' unique violation (PostgreSQL code 23505)
 * and stays queued: callers read that as "not now", not as a lost run
 * (F2-07).
 */
export function startRun(
  runId: string,
  attempt: RunAttempt = { jobId: null, attempt: 0 },
): Promise<SyncRun | null> {
  return markRunStarted(runId, attempt)
}

/**
 * Inside a transaction: whether the attempt still holds the run, returned
 * locked until the transaction ends, so a later attempt or recovery cannot
 * take it over before the transaction's writes commit. Null when the run
 * was lost: finished, or taken over by a later attempt.
 */
export function holdRun(
  runId: string,
  attempt: number,
): Promise<SyncRun | null> {
  return lockHeldRun(runId, attempt)
}

/**
 * Finishes a queued or running run with the status the caller chose; given
 * an attempt, only while that attempt holds the run. Returns false, without
 * changes, when the run had already finished or was taken over.
 */
export function finishRun(
  runId: string,
  outcome: {
    status: FinishedRunStatus
    error: string | null
    diagnostics?: unknown
  },
  attempt?: number,
): Promise<boolean> {
  return markRunFinished(
    runId,
    {
      status: outcome.status,
      error: outcome.error,
      diagnostics: outcome.diagnostics ?? null,
    },
    attempt,
  )
}

/** The run with its scope parameters, or null. */
export function readRun(runId: string): Promise<SyncRun | null> {
  return findRun(runId)
}

/** Queued and running runs, optionally of one source, oldest first. */
export function listUnfinishedRuns(source?: string): Promise<SyncRun[]> {
  return findUnfinishedRuns(source)
}
