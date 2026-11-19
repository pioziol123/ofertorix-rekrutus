import type { PgBoss } from 'pg-boss'
import { queueDatabase } from '../../../../lib/db.ts'
import { requireQueued } from '../../../../lib/queue.ts'
import { extractImport } from '../../extract-cv-text.ts'

/** The queue of extracting the text of an uploaded CV document. */
export const parseQueue = 'profile-parse'
export const parseQueueOptions = { retryLimit: 0, expireInSeconds: 120 }

/** Requests extracting the text of an import, in the caller's transaction. */
export async function sendCvTextJob(boss: PgBoss, importId: string) {
  await requireQueued(
    boss.send(
      parseQueue,
      { importId },
      { db: queueDatabase, ...parseQueueOptions },
    ),
  )
}

/** Has this process extract the text of the queued imports. */
export async function workCvTextQueue(boss: PgBoss) {
  await boss.work<{ importId: string }>(parseQueue, async (jobs) => {
    for (const job of jobs) await extractImport(job.data.importId)
  })
}
