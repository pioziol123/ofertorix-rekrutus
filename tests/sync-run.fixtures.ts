import type { PgBoss } from 'pg-boss'
import { db } from '../lib/db.ts'
import { syncQueueFor } from '../lib/sources/sync-queues.ts'
import { executeSyncRun, recoverSyncRuns } from '../modules/sources/index.ts'
import type { ConnectorProvider } from '../modules/sources/infrastructure/adapters/connector-registry.ts'

// The shared executor and recovery as the worker calls them.

/** Delivers the run's queue job to the shared executor, by default as the first attempt. */
export async function deliver(
  runId: string,
  connectors: ConnectorProvider,
  attempt = 0,
): Promise<void> {
  const { rows } = await db().query<{ job_id: string | null }>(
    'SELECT job_id FROM source_sync_runs WHERE id=$1',
    [runId],
  )
  await executeSyncRun(
    {
      runId,
      jobId: rows[0]?.job_id ?? null,
      attempt,
      signal: new AbortController().signal,
    },
    connectors,
  )
}

/** Recovery reading job states from the queue the run's source uses. */
export function recover(boss: PgBoss): Promise<void> {
  return recoverSyncRuns(({ source, jobId }) => {
    const queue = syncQueueFor(source)
    return queue ? boss.getJobById(queue, jobId) : Promise.resolve(null)
  })
}
