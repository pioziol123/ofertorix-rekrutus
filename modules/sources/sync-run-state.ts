import { transaction } from '../../lib/db.ts'
import { hash } from './domain/canonical-hash.ts'
import type {
  FinishedRunStatus,
  RunTrigger,
  SyncRunStatus,
} from './domain/run-states.ts'
import {
  findRun,
  findUnfinishedRunId,
  findUnfinishedRuns,
  insertQueuedRun,
  lockRunningRun,
  lockSourceRequests,
  markRunFinished,
  markRunStarted,
  upsertScope,
} from './infrastructure/persistence/sync-runs.ts'

/**
 * The state of sync runs in one place: admission, start, finish and the reads
 * the request and the carry-over need. Internal to the Sources module.
 * Whoever manages a run decides about it (status, error, diagnostics); these
 * operations only guard the allowed transitions and B5-R02.
 */

/** The closed lists themselves have one owner: domain/run-states.ts. */
export type {
  FinishedRunStatus,
  RunTrigger,
  SyncRunStatus,
} from './domain/run-states.ts'

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
   * Requests the run's queue job inside the admission's transaction, or
   * throws, which rolls the admission back.
   */
  sendJob: (runId: string) => Promise<unknown>
}

export type AdmittedRun = { id: string; existing: boolean }

/**
 * Admits a run for the source (B5-R02): under the source's transaction lock,
 * returns the source's unfinished run, of any scope, as existing; otherwise
 * creates a queued run of the scope and its queue job together. Concurrent
 * admissions of one source wait for the lock, so they create one run.
 */
export function admitRun(admission: RunAdmission): Promise<AdmittedRun> {
  return transaction(async () => {
    await lockSourceRequests(admission.source)
    const unfinished = await findUnfinishedRunId(admission.source)
    if (unfinished) return { id: unfinished, existing: true }
    const scopeId = await upsertScope(
      admission.source,
      hash(admission.parameters),
      admission.parameters,
    )
    const id = await insertQueuedRun({
      scopeId,
      trigger: admission.trigger,
      scheduleDay: admission.scheduleDay,
    })
    await admission.sendJob(id)
    return { id, existing: false }
  })
}

/**
 * Starts a queued run, or takes a running run over for a later attempt: the
 * run continues instead of a new one (B5-R04). Returns null, without
 * changes, for a finished run or an unknown id, and `'scope-running'`,
 * without changes, for a queued run while another run of its scope is
 * running, which the per-scope running-run index refuses.
 *
 * ASSUMPTION(oferty-pracy-2ba.5/ASM-1): only runs requested before B5 can
 * meet another unfinished run of their scope.
 */
export async function startRun(
  runId: string,
): Promise<SyncRun | null | 'scope-running'> {
  try {
    return await markRunStarted(runId)
  } catch (error) {
    const violation = error as { code?: unknown; constraint?: unknown }
    if (
      violation.code === '23505' &&
      violation.constraint === 'source_one_running_run'
    )
      return 'scope-running'
    throw error
  }
}

/**
 * Inside a transaction: the run while it is still running, locked until the
 * transaction ends, so it cannot be finished before the transaction's writes
 * commit. Null when it is no longer running.
 */
export function holdRun(runId: string): Promise<SyncRun | null> {
  return lockRunningRun(runId)
}

/**
 * Finishes a run with the status the caller chose, only while it is in one
 * of the `from` states, by default queued or running. Returns false,
 * without changes, otherwise. `markedUnavailable` is the count of a
 * complete run's marking step (T2), stored with the status; null by
 * default.
 */
export function finishRun(
  runId: string,
  outcome: {
    status: FinishedRunStatus
    error: string | null
    diagnostics?: unknown
    markedUnavailable?: number | null
  },
  from: readonly SyncRunStatus[] = ['queued', 'running'],
): Promise<boolean> {
  return markRunFinished(
    runId,
    {
      status: outcome.status,
      error: outcome.error,
      diagnostics: outcome.diagnostics ?? null,
      markedUnavailable: outcome.markedUnavailable ?? null,
    },
    from,
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
