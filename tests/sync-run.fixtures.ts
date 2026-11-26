import { createRequire } from 'node:module'
import {
  applyQueueConfiguration,
  readQueueConfiguration,
} from '../lib/queues/index.ts'
import { executeSyncRun, syncJob } from '../modules/sources/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { ConnectorProvider } from '../modules/sources/infrastructure/adapters/connector-registry.ts'

/**
 * Carries the run's job out in the test process, as the worker's pool
 * process calls the sync handler, with the given connectors.
 */
export async function deliver(
  runId: string,
  connectors: ConnectorProvider,
): Promise<void> {
  await executeSyncRun({ runId }, connectors)
}

/** The migrations of the Sources tables, in order. */
export const sourcesMigrations = [
  '1770000000001_sources',
  '1770000000005_jobspy',
  '1770000000014_sync_run_state',
  '1770000000015_sync_run_attempt',
  '1770000000024_sync_run_without_queue_job',
  '1770000000038_sync_run_marked_unavailable',
] as const

/**
 * Prepares the queue of sync runs in the queue schema `queueSchema` as the
 * migration step does: runs its queue migration, then applies its entry of
 * the repository's queue configuration, or `settings` when given.
 */
export async function prepareSyncRunQueue(
  queueSchema: string,
  settings?: { attempts?: number; timeLimitSeconds?: number },
): Promise<void> {
  const previous = process.env.PG_BOSS_SCHEMA
  process.env.PG_BOSS_SCHEMA = queueSchema
  try {
    await createRequire(import.meta.url)(
      '../migrations/1770000000023_source_sync_run_queue.cjs',
    ).up()
    const queue = syncJob.queue
    await applyQueueConfiguration({
      [queue]: settings ?? readQueueConfiguration()[queue] ?? {},
    })
  } finally {
    if (previous === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previous
  }
}
