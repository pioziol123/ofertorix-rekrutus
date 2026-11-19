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
  recoverImports,
  resumeProposalPreparations,
  workCvTextQueue,
} from '../modules/profile/index.ts'
import { closePool, getPool } from '../lib/db.ts'
import { createBoss, smokeQueue } from '../lib/queue.ts'

import {
  recoverSyncRuns,
  currentScheduleDay,
  requestScheduledSyncs,
  useSyncQueue,
  workSyncQueue,
} from '../modules/sources/index.ts'

import {
  assessmentReceiver,
  assessmentSettingsKey,
} from '../modules/matching/index.ts'
import {
  researchReceiver,
  researchSettingsKey,
} from '../modules/companies/index.ts'

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
currentScheduleDay()
useSyncQueue(boss)
await recoverSyncRuns()
await workSyncQueue(boss)
await recoverImports(boss)
await workCvTextQueue(boss)
useAiQueue(boss)
registerResultReceiver(proposalSettingsKey, proposalReceiver)
registerResultReceiver(assessmentSettingsKey, assessmentReceiver)
registerResultReceiver(researchSettingsKey, researchReceiver)
await resumeProposalPreparations()
await recoverExecutions()
await boss.work<{ executionId: string }>(aiExecutionQueue, async (jobs) => {
  for (const job of jobs) await runExecution(job.data.executionId)
})
let scheduling = false
async function schedule() {
  if (scheduling || stopping) return
  scheduling = true
  try {
    await recoverSyncRuns()
    await requestScheduledSyncs()
    await recoverImports(boss)
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
