import type { PgBoss } from 'pg-boss'
import { db } from '../lib/db.ts'
import { recoverSyncQueues } from '../lib/sources/sync-queues.ts'
import { executeSyncRun } from '../modules/sources/index.ts'
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

/** The worker's recovery, reading job states from the source queues. */
export const recover = (boss: PgBoss): Promise<void> => recoverSyncQueues(boss)
