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
import { createBoss } from '../lib/queue.ts'
import { stopQueues } from '../lib/queues/index.ts'
import { requestUnfinishedCvTextReadings } from '../modules/profile/index.ts'

// Each former queue with the module operation that requests its work anew.
const carryOvers: Record<string, () => Promise<number>> = {
  // Every CV queued or being read gets one reading job (B4-R08, B4-D02).
  'profile-parse': requestUnfinishedCvTextReadings,
}

const boss = createBoss()
try {
  await boss.start()
  for (const [queue, carryOver] of Object.entries(carryOvers)) {
    if (!(await boss.getQueue(queue))) continue
    const requested = await carryOver()
    await boss.deleteQueue(queue)
    console.info(
      `Carried ${requested} jobs over from queue "${queue}" and deleted it`,
    )
  }
} finally {
  await boss.stop()
  await stopQueues()
  await closePool()
}
