import { createBoss, smokeQueue } from '../lib/queue.ts'
import { aiExecutionJobOptions, aiExecutionQueue } from '../modules/ai/index.ts'

import { syncQueue, syncQueueOptions } from '../modules/sources/index.ts'

import { parseQueue } from '../lib/profile/imports.ts'

const boss = createBoss(true)
try {
  await boss.start()
  await boss.createQueue(smokeQueue, { retryLimit: 1, heartbeatSeconds: 30 })
  await boss.createQueue(syncQueue, syncQueueOptions)
  await boss.createQueue(parseQueue, { retryLimit: 0, expireInSeconds: 120 })
  await boss.createQueue(aiExecutionQueue, aiExecutionJobOptions)
  console.info('Queue schema ready')
} finally {
  await boss.stop()
}
