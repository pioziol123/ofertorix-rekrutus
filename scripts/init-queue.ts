/**
 * The migration step's queue part, run after the database migrations, which
 * include the queue migrations that create each queue of the queue library
 * (B1-R03, B1-D05). It runs no module's code: the queue configuration is
 * applied to the queues the queue migrations created.
 */
import {
  applyQueueConfiguration,
  deleteQueue,
  readQueueConfiguration,
} from '../lib/queues/index.ts'

// An invalid queue configuration stops the step before any change (B1-R04).
const configuration = readQueueConfiguration()

// The system check job is gone (B1-R16); its queue goes with its jobs.
await deleteQueue('system-smoke')

await applyQueueConfiguration(configuration)
console.info('Queue schema ready')
