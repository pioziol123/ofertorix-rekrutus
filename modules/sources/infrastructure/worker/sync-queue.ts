import type { PgBoss } from 'pg-boss'
import { queueDatabase } from '../../../../lib/db.ts'
import { requireQueued } from '../../../../lib/queue.ts'
import { executeSyncRun } from '../../execute-sync-run.ts'
import type { ConnectorProvider } from '../adapters/connector-registry.ts'
import { sourceConnectors } from '../adapters/source-connectors.ts'

/**
 * The one queue of sync runs of every source (F2-06). A job carries only
 * the run id; its group is the run's source, and the worker executes at
 * most one job of a group at a time across all workers, oldest first.
 */
export const syncQueue = 'source-sync'

/**
 * Queue options of every sync run job (F2-13): the worker refreshes the
 * heartbeat while it executes the run; a lost worker misses it and the
 * queue retries the job, whose next attempt continues the same run, at most
 * twice. An attempt may take at most an hour.
 */
export const syncJobOptions = {
  heartbeatSeconds: 30,
  retryLimit: 2,
  expireInSeconds: 3600,
} as const

/** Options the sync queue is created with. */
export const syncQueueOptions = {
  policy: 'standard',
  ...syncJobOptions,
} as const

let queue: PgBoss | undefined

/** Connects sync requesting and recovery to the process's queue client. */
export function useSyncQueue(boss: PgBoss): void {
  queue = boss
}

function boss(): PgBoss {
  if (!queue) throw new Error('The source sync queue is not connected')
  return queue
}

/** Sends the run's job in the current transaction; returns the job id. */
export function sendSyncJob(run: {
  id: string
  source: string
}): Promise<string> {
  return requireQueued(
    boss().send(
      syncQueue,
      { runId: run.id },
      { ...syncJobOptions, group: { id: run.source }, db: queueDatabase },
    ),
  )
}

/** The state of a run's queue job, or null when the queue has no such job. */
export type SyncJobLookup = (job: {
  source: string
  jobId: string
}) => Promise<{ state: string } | null>

/**
 * Looks a run's job up in the sync queue. A job left in a queue of the
 * per-source requesting before 0mq.16 is not found there, so recovery ends
 * its run (A16-R07).
 */
export const findSyncJob: SyncJobLookup = ({ jobId }) =>
  boss().getJobById(syncQueue, jobId)

/**
 * Has the shared executor work the sync queue on the client: one concurrent
 * job per registered source, and across all workers at most one run per
 * source at a time, the oldest first (F2-06). An aborted or lost attempt
 * throws, so the queue retries the job and the next attempt continues the
 * same run.
 */
export async function workSyncQueue(
  worker: PgBoss,
  /** Tests replace the application's connectors. */
  connectors: ConnectorProvider = sourceConnectors,
): Promise<void> {
  await worker.work<{ runId: string }>(
    syncQueue,
    {
      localConcurrency: connectors.names().length,
      groupConcurrency: 1,
    },
    async (jobs) => {
      for (const job of jobs)
        await executeSyncRun(
          {
            runId: job.data.runId,
            jobId: job.id,
            attempt: job.retryCount,
            signal: job.signal,
          },
          connectors,
        )
    },
  )
}
