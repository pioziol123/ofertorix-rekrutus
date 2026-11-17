import { finishedRunStatus } from './domain/run-status.ts'
import {
  finishRun,
  listUnfinishedRuns,
  readRun,
  type SyncRun,
} from './sync-run-state.ts'

/** Queue job states in which no attempt will execute the job any more. */
const endedJobStates = new Set(['completed', 'failed', 'cancelled'])

/** The state of a run's queue job, or null when the queue has no such job. */
export type SyncJobLookup = (job: {
  source: string
  jobId: string
}) => Promise<{ state: string } | null>

const interrupted = {
  running: 'Worker interrupted; request a new import',
  queued: 'Queue delivery ended; request a new import',
  inProcess: 'Import interrupted; request a new import',
} as const

/**
 * How long a run executed in the requesting process may run before recovery
 * treats it as left by a process that died. Such a run has no queue job to
 * tell whether it is alive. Twice the Himalayas run limit of 120 s, the only
 * source run this way until 0mq.16 (owner decision 2026-11-17).
 */
export const inProcessRunLimitSeconds = 240
const inProcessLimitMs = inProcessRunLimitSeconds * 1000

/**
 * Finishes the unfinished runs no work will execute any more (A5-R06): a
 * queued or running run whose queue job does not exist or has ended, and a
 * run executed without a queue that has been running longer than
 * `inProcessRunLimitSeconds`. Such a run ends partial or failed by its saved ads,
 * with a message that asks for a new request. Runs whose job waits, is
 * retried or is active stay as they are.
 *
 * Every change is conditional on the run still being unfinished, without
 * session locks, so several workers may recover at the same time.
 */
export async function recoverSyncRuns(
  findJob: SyncJobLookup,
  now: Date = new Date(),
): Promise<void> {
  for (const run of await listUnfinishedRuns()) {
    if (run.jobId) {
      const job = await findJob({ source: run.source, jobId: run.jobId })
      if (job && !endedJobStates.has(job.state)) continue
    } else if (
      run.status === 'running' &&
      now.getTime() - (run.startedAt ?? now).getTime() < inProcessLimitMs
    )
      continue
    await finishInterrupted(
      run,
      run.status === 'queued' ? interrupted.queued : interrupted.running,
    )
  }
}

/**
 * Finishes a run executed in the requesting process after that process
 * stopped it, while its attempt still holds it.
 */
export async function finishStoppedRun(
  runId: string,
  attempt: number,
): Promise<void> {
  const run = await readRun(runId)
  if (run) await finishInterrupted(run, interrupted.inProcess, attempt)
}

function finishInterrupted(run: SyncRun, error: string, attempt?: number) {
  return finishRun(
    run.id,
    {
      status: finishedRunStatus({
        sourceComplete: false,
        saveFailed: false,
        uniqueAds: run.uniqueAds,
      }),
      error,
    },
    attempt,
  )
}
