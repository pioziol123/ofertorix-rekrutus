import { companyResearchQueue } from '../lib/companies/research.ts'
import { matchingGroupQueue } from '../lib/matching/groups.ts'
import { createBoss, smokeQueue } from '../lib/queue.ts'

import { importQueue } from '../lib/sources/solid.ts'
import { queueFor } from '../lib/sources/jobspy.ts'
import { jobspySources } from '../lib/sources/jobspy-catalog.ts'

import { polishQueue, polishSources } from '../lib/sources/polish.ts'

import { matchingQueue } from '../lib/matching/store.ts'

import { parseQueue, aiQueue } from '../lib/profile/imports.ts'

const boss = createBoss(true)
try {
  await boss.start()
  await boss.createQueue(smokeQueue, { retryLimit: 1, heartbeatSeconds: 30 })
  await boss.createQueue(importQueue, { retryLimit: 0, expireInSeconds: 3600 })
  for (const source of jobspySources)
    await boss.createQueue(queueFor(source), {
      retryLimit: 0,
      expireInSeconds: 300,
    })
  for (const source of polishSources)
    await boss.createQueue(polishQueue(source), {
      retryLimit: 0,
      expireInSeconds: 300,
    })
  await boss.createQueue(parseQueue, { retryLimit: 0, expireInSeconds: 120 })
  await boss.createQueue(aiQueue, { retryLimit: 0, expireInSeconds: 300 })
  await boss.createQueue(matchingQueue, { retryLimit: 0, expireInSeconds: 300 })
  await boss.createQueue(matchingGroupQueue, {
    retryLimit: 0,
    expireInSeconds: 300,
  })
  await boss.createQueue(companyResearchQueue, {
    retryLimit: 0,
    expireInSeconds: 360,
  })
  console.info('Queue schema ready')
} finally {
  await boss.stop()
}
