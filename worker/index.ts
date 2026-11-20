import { fileURLToPath } from 'node:url'
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
import { closePool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import { poolSizeFromEnvironment, startWorker } from '../lib/workers/index.ts'

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

const boss = createBoss()
let stopping = false
const fatal = () => {
  console.error(
    'Worker failed; inspect service configuration and database availability',
  )
  process.exit(1)
}
boss.on('error', fatal)
await boss.start()
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
// The worker library takes the jobs of the module plugins' job definitions
// and writes the worker's liveness record (B1-R14). The existing path above
// stays until each module is moved to the libraries (B1-R17, B1-D14).
const worker = await startWorker({
  plugins: fileURLToPath(new URL('../plugins/index.ts', import.meta.url)),
  poolSize: poolSizeFromEnvironment(),
})
console.info('Worker ready')
async function shutdown() {
  if (stopping) return
  stopping = true
  clearInterval(scheduleTimer)
  await Promise.all([worker.stop(), boss.stop()])
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
