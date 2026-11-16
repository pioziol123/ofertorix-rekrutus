import type { PgBoss } from 'pg-boss'
import {
  executeSyncRun,
  recoverSyncRuns,
  type SyncJobLookup,
} from '../../modules/sources/index.ts'
import type { ConnectorProvider } from '../../modules/sources/infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from '../../modules/sources/infrastructure/adapters/source-connectors.ts'
import { queueFor } from './jobspy.ts'
import { jobspySources, type JobspySource } from './jobspy-catalog.ts'
import { polishQueue, polishSources, type PolishSource } from './polish.ts'
import { importQueue, source as solidJobs } from './solid.ts'

// Until 0mq.16 replaces them with one sync queue, each queued source keeps
// its own queue, and every one of them feeds the shared executor.

/**
 * The queue that carries a source's sync jobs, or null for a source without
 * one (Himalayas runs in the CLI process).
 */
export function syncQueueFor(source: string): string | null {
  if (source === solidJobs) return importQueue
  if ((jobspySources as readonly string[]).includes(source))
    return queueFor(source as JobspySource)
  if ((polishSources as readonly string[]).includes(source))
    return polishQueue(source as PolishSource)
  return null
}

/** Every queue that carries sync jobs. */
export const syncQueues = [
  importQueue,
  ...jobspySources.map((source) => queueFor(source)),
  ...polishSources.map((source) => polishQueue(source)),
]

/**
 * Has the shared executor work every sync queue. An aborted or lost attempt
 * throws, so the queue retries the job and the next attempt continues the
 * same run.
 */
export async function workSyncQueues(
  boss: PgBoss,
  connectors: ConnectorProvider = sourceConnectors,
): Promise<void> {
  for (const queue of syncQueues)
    await boss.work<{ runId: string }>(queue, async (jobs) => {
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
    })
}

/** Recovery reading each run's job from its source's queue. */
export function recoverSyncQueues(boss: PgBoss): Promise<void> {
  const findJob: SyncJobLookup = async ({ source, jobId }) => {
    const queue = syncQueueFor(source)
    return queue ? boss.getJobById(queue, jobId) : null
  }
  return recoverSyncRuns(findJob)
}
