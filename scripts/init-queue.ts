import { createBoss } from '../lib/queue.ts'
import { prepareQueues, readQueueConfiguration } from '../lib/queues/index.ts'
import { HandlerRegistry } from '../lib/workers/index.ts'
import { runModulePlugins } from '../plugins/index.ts'
import { aiExecutionJobOptions, aiExecutionQueue } from '../modules/ai/index.ts'

import { syncQueue, syncQueueOptions } from '../modules/sources/index.ts'

import { parseQueue, parseQueueOptions } from '../modules/profile/index.ts'

// An invalid queue configuration stops the step before any change (B1-R04).
const configuration = readQueueConfiguration()

// The queues of the modules not yet moved to the queue library (B1-R17).
const boss = createBoss(true)
try {
  await boss.start()
  await boss.createQueue(syncQueue, syncQueueOptions)
  await boss.createQueue(parseQueue, parseQueueOptions)
  await boss.createQueue(aiExecutionQueue, aiExecutionJobOptions)
  // The system check job is gone (B1-R16); its queue goes with its jobs.
  if (await boss.getQueue('system-smoke'))
    await boss.deleteQueue('system-smoke')
} finally {
  await boss.stop()
}

// The queues of the job definitions the module plugins register (B1-R03).
const registry = new HandlerRegistry()
await runModulePlugins(registry)
await prepareQueues(registry.definitions(), configuration)
console.info('Queue schema ready')
