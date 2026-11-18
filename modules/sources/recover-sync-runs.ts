import { finishedRunStatus } from './domain/run-status.ts'
import {
  findSyncJob,
  type SyncJobLookup,
} from './infrastructure/worker/sync-queue.ts'
import {
  finishRun,
  listUnfinishedRuns,
  type SyncRun,
} from './sync-run-state.ts'

/** Queue job states in which no attempt will execute the job any more. */
const endedJobStates = new Set(['completed', 'failed', 'cancelled'])

const interrupted = {
  running: 'Worker interrupted; request a new import',
  queued: 'Queue delivery ended; request a new import',
} as const

/**
 * Finishes the unfinished runs no work will execute any more (A5-R06): a
 * queued or running run without a job in the sync queue, or whose job has
 * ended. That includes a run whose job lies in a queue of the per-source
 * requesting before 0mq.16 and a run executed by a CLI process before it
 * (A16-R07). Such a run ends partial or failed by its saved ads, with a
 * message that asks for a new request. Runs whose job waits, is retried or
 * is active stay as they are.
 *
 * Every change is conditional on the run still being unfinished, without
 * session locks, so several workers may recover at the same time.
 */
export async function recoverSyncRuns(
  findJob: SyncJobLookup = findSyncJob,
): Promise<void> {
  for (const run of await listUnfinishedRuns()) {
    if (run.jobId) {
      const job = await findJob({ source: run.source, jobId: run.jobId })
      if (job && !endedJobStates.has(job.state)) continue
    }
    await finishInterrupted(
      run,
      run.status === 'queued' ? interrupted.queued : interrupted.running,
    )
  }
}

function finishInterrupted(run: SyncRun, error: string) {
  return finishRun(run.id, {
    status: finishedRunStatus({
      sourceComplete: false,
      saveFailed: false,
      uniqueAds: run.uniqueAds,
    }),
    error,
  })
}
