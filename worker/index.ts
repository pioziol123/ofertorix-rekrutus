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
import {
  aiExecutionQueue,
  recoverExecutions,
  registerResultReceiver,
  runExecution,
  useAiQueue,
} from '../modules/ai/index.ts'
import {
  proposalReceiver,
  proposalSettingsKey,
  resumeProposalPreparations,
} from '../modules/profile/index.ts'
import { closePool, getPool } from '../lib/db.ts'
import { createBoss, smokeQueue } from '../lib/queue.ts'

import { scheduleDay } from '../lib/sources/solid.ts'
import { enqueueSync } from '../lib/sources/sync.ts'
import {
  recoverSyncQueues,
  workSyncQueues,
} from '../lib/sources/sync-queues.ts'

import {
  parseQueue,
  extractImport,
  recoverImports,
} from '../lib/profile/imports.ts'
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
await recoverSyncQueues(boss)
await workSyncQueues(boss)
await recoverImports(pool, boss)
await boss.work<{ importId: string }>(parseQueue, async (jobs) => {
  for (const job of jobs) await extractImport(pool, job.data.importId)
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
useAiQueue(boss)
registerResultReceiver(proposalSettingsKey, proposalReceiver)
await resumeProposalPreparations()
await recoverExecutions()
await boss.work<{ executionId: string }>(aiExecutionQueue, async (jobs) => {
  for (const job of jobs) await runExecution(job.data.executionId)
})
await boss.work<{ operationId: string }>(companyResearchQueue, async (jobs) => {
  for (const job of jobs)
    await executeCompanyResearch(pool, boss, job.data.operationId)
})
let scheduling = false
async function schedule() {
  if (scheduling || stopping) return
  scheduling = true
  try {
    await recoverSyncQueues(boss)
    await enqueueSync(pool, boss, 'scheduled')
    await recoverImports(pool, boss)
    await recoverMatching(pool, boss)
    await recoverMatchingGroups(pool, boss)
    await recoverCompanyResearch(pool, boss)
    await resumeProposalPreparations()
    await recoverExecutions()
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
