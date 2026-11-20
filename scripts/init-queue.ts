/**
 * The migration step's queue part, run after the database migrations, which
 * include the queue migrations that create each queue of the queue library
 * (B1-R03, B1-D05). It runs no module's code: the queues of the existing
 * path have their names and settings written here, and the queue
 * configuration is applied to the queues the queue migrations created.
 */
import { createBoss } from '../lib/queue.ts'
import {
  applyQueueConfiguration,
  readQueueConfiguration,
} from '../lib/queues/index.ts'

// An invalid queue configuration stops the step before any change (B1-R04).
const configuration = readQueueConfiguration()

// The queues of the modules not yet moved to the queue library (B1-R17),
// with the settings their modules send their jobs with. Transitional
// (B1-D14): each module's task moves its queue to a queue migration.
const existingPathQueues = {
  'source-sync': {
    policy: 'standard',
    heartbeatSeconds: 30,
    retryLimit: 2,
    expireInSeconds: 3600,
  },
  'profile-parse': { retryLimit: 0, expireInSeconds: 120 },
  'ai-execution': {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
  },
} as const

const boss = createBoss(true)
try {
  await boss.start()
  for (const [name, options] of Object.entries(existingPathQueues))
    await boss.createQueue(name, options)
  // The system check job is gone (B1-R16); its queue goes with its jobs.
  if (await boss.getQueue('system-smoke'))
    await boss.deleteQueue('system-smoke')
} finally {
  await boss.stop()
}

await applyQueueConfiguration(configuration)
console.info('Queue schema ready')
