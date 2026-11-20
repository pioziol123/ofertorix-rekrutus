import { createRequire } from 'node:module'
import {
  applyQueueConfiguration,
  readQueueConfiguration,
} from '../lib/queues/index.ts'
import { cvTextReadingJob } from '../modules/profile/index.ts'

/**
 * Prepares the queue of reading a CV in the queue schema `queueSchema` as
 * the migration step does: runs its queue migration, then applies its entry
 * of the repository's queue configuration.
 */
export async function prepareCvTextQueue(queueSchema: string): Promise<void> {
  const previous = process.env.PG_BOSS_SCHEMA
  process.env.PG_BOSS_SCHEMA = queueSchema
  try {
    await createRequire(import.meta.url)(
      '../migrations/1770000000022_profile_cv_text_queue.cjs',
    ).up()
    const queue = cvTextReadingJob.queue
    await applyQueueConfiguration({
      [queue]: readQueueConfiguration()[queue] ?? {},
    })
  } finally {
    if (previous === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previous
  }
}
