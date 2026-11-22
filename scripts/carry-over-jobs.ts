/**
 * The migration step's last part, run after the queue configuration is
 * applied, so that the jobs it requests take their queue's settings. It
 * carries the work a queue of the former path still holds over to the queue
 * library, through the owning module's public operation, then deletes that
 * queue with its waiting jobs. A queue that no longer exists was carried
 * over by an earlier deployment, so a second run changes nothing.
 *
 * Unlike the queue migrations and the queue configuration step, this part
 * calls module operations: carrying work over needs the modules' rules
 * (B1-D05). It does not run the module plugins.
 */
import { closePool } from '../lib/db.ts'
import { deleteQueue, queueExists, stopQueues } from '../lib/queues/index.ts'
import { requestUnfinishedCvTextReadings } from '../modules/profile/index.ts'
import { requestUnfinishedSyncRuns } from '../modules/sources/index.ts'

// Each former queue with the module operation that requests its work anew.
const carryOvers: Record<string, () => Promise<number>> = {
  // Every CV queued or being read gets one reading job (B4-R08, B4-D02).
  'profile-parse': requestUnfinishedCvTextReadings,
  // Every sync run queued or running gets one job: a queued one is carried
  // out, a running one taken over (B5-R08, B5-D03).
  'source-sync': requestUnfinishedSyncRuns,
}

try {
  for (const [queue, carryOver] of Object.entries(carryOvers)) {
    if (!(await queueExists(queue))) continue
    const requested = await carryOver()
    await deleteQueue(queue)
    console.info(
      `Carried ${requested} jobs over from queue "${queue}" and deleted it`,
    )
  }
} finally {
  await stopQueues()
  await closePool()
}
