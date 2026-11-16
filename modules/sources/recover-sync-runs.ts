import { finishedRunStatus } from './domain/run-status.ts'
import { finishRun, listUnfinishedRuns } from './sync-run-state.ts'

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
} as const

/**
 * Finishes the unfinished runs no queue work will execute any more: their
 * job does not exist or has ended (A5-R06). Such a run ends partial or
 * failed by its saved ads, with a message that asks for a new request.
 * Runs whose job waits, is retried or is active stay as they are.
 *
 * Every change is conditional on the run still being unfinished, without
 * session locks, so several workers may recover at the same time.
 */
export async function recoverSyncRuns(findJob: SyncJobLookup): Promise<void> {
  for (const run of await listUnfinishedRuns()) {
    const job = run.jobId
      ? await findJob({ source: run.source, jobId: run.jobId })
      : null
    if (job && !endedJobStates.has(job.state)) continue
    await finishRun(run.id, {
      status: finishedRunStatus({
        sourceComplete: false,
        saveFailed: false,
        uniqueAds: run.uniqueAds,
      }),
      error:
        run.status === 'running' ? interrupted.running : interrupted.queued,
    })
  }
}
