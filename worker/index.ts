import {
  companyResearchQueue,
  executeCompanyResearch,
  recoverCompanyResearch,
} from '../lib/companies/research.ts'
import {
  matchingGroupQueue,
  executeMatchingGroup,
  recoverMatchingGroups,
} from '../lib/matching/groups.ts'
import { closePool, getPool } from '../lib/db.ts'
import { createBoss, smokeQueue } from '../lib/queue.ts'

import { scheduleDay } from '../lib/sources/solid.ts'
import { enqueueSync } from '../lib/sources/sync.ts'
import { syncQueueFor, syncQueues } from '../lib/sources/sync-queues.ts'
import {
  executeSyncRun,
  recoverSyncRuns,
  type SyncJobLookup,
} from '../modules/sources/index.ts'

import {
  parseQueue,
  aiQueue,
  extractImport,
  recoverImports,
} from '../lib/profile/imports.ts'
import { executeAi, resumeAi } from '../lib/profile/ai.ts'
import { recoverLocalProfiles } from '../lib/profile/local-ai.ts'
import {
  matchingQueue,
  executeMatching,
  recoverMatching,
} from '../lib/matching/store.ts'

const pool = getPool()
const boss = createBoss()
let stopping = false
const heartbeat = async () => {
  await pool.query(`INSERT INTO service_heartbeats (service) VALUES ('worker')
    ON CONFLICT (service) DO UPDATE SET last_seen = now()`)
}
const fatal = () => {
  console.error(
    'Worker failed; inspect service configuration and database availability',
  )
  process.exit(1)
}
boss.on('error', fatal)
await boss.start()
await boss.work<{ checkId: string }>(smokeQueue, async (jobs) => {
  for (const job of jobs) {
    await pool.query(
      'INSERT INTO system_checks (id) VALUES ($1) ON CONFLICT DO NOTHING',
      [job.data.checkId],
    )
  }
})
// Validate the schedule before registering the importer.
scheduleDay()
const findSyncJob: SyncJobLookup = async ({ source, jobId }) => {
  const queue = syncQueueFor(source)
  return queue ? boss.getJobById(queue, jobId) : null
}
await recoverSyncRuns(findSyncJob)
// Every source queue runs the shared executor. An aborted or lost attempt
// throws, so the queue retries the job and the next attempt continues the run.
for (const queue of syncQueues)
  await boss.work<{ runId: string }>(queue, async (jobs) => {
    for (const job of jobs)
      await executeSyncRun({
        runId: job.data.runId,
        jobId: job.id,
        attempt: job.retryCount,
        signal: job.signal,
      })
  })
await recoverImports(pool, boss)
await resumeAi(pool, boss)
await recoverLocalProfiles(pool, boss)
await boss.work<{ importId: string }>(parseQueue, async (jobs) => {
  for (const job of jobs) await extractImport(pool, job.data.importId)
})
await boss.work<{ attemptId: string }>(aiQueue, async (jobs) => {
  for (const job of jobs) await executeAi(pool, boss, job.data.attemptId)
})
await recoverMatching(pool, boss)
await boss.work<{ requestId: string }>(matchingQueue, async (jobs) => {
  for (const job of jobs) await executeMatching(pool, boss, job.data.requestId)
})
await recoverMatchingGroups(pool, boss)
await boss.work<{ groupId: string }>(matchingGroupQueue, async (jobs) => {
  for (const job of jobs)
    await executeMatchingGroup(pool, boss, job.data.groupId)
})
await recoverCompanyResearch(pool, boss)
await boss.work<{ operationId: string }>(companyResearchQueue, async (jobs) => {
  for (const job of jobs)
    await executeCompanyResearch(pool, boss, job.data.operationId)
})
let scheduling = false
async function schedule() {
  if (scheduling || stopping) return
  scheduling = true
  try {
    await recoverSyncRuns(findSyncJob)
    await enqueueSync(pool, boss, 'scheduled')
    await recoverImports(pool, boss)
    await resumeAi(pool, boss)
    await recoverLocalProfiles(pool, boss)
    await recoverMatching(pool, boss)
    await recoverMatchingGroups(pool, boss)
    await recoverCompanyResearch(pool, boss)
  } finally {
    scheduling = false
  }
}
await schedule()
const scheduleTimer = setInterval(() => {
  void schedule().catch(fatal)
}, 60_000)
await heartbeat()
const timer = setInterval(() => {
  void heartbeat().catch(fatal)
}, 10_000)
console.info('Worker ready')
async function shutdown() {
  if (stopping) return
  stopping = true
  clearInterval(timer)
  clearInterval(scheduleTimer)
  await boss.stop()
  await closePool()
}
process.on('SIGTERM', () => {
  void shutdown()
    .then(() => process.exit(0))
    .catch(fatal)
})
process.on('SIGINT', () => {
  void shutdown()
    .then(() => process.exit(0))
    .catch(fatal)
})
