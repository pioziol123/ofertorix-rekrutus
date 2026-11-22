/**
 * The AI module plugin: registers the jobs of paid work and of work on the
 * local model with the same job handler and failure handler (B6-R02,
 * B6-R07), and the result receivers of the old way, which the handler
 * delivers to the work the Profile, Matching and Companies requested before
 * they moved to assignments (until task oferty-pracy-sq2.11). The queue of each executor of assignments
 * gets the handler of operations (epic sq2, T3) and their failure handler
 * (T4).
 */
import type { HandlerRegistry } from '../lib/workers/index.ts'
import {
  endFailedExecution,
  endFailedOperation,
  executorJobs,
  localExecutionJob,
  paidExecutionJob,
  registerResultReceiver,
  runExecution,
  runOperation,
} from '../modules/ai/index.ts'
import {
  researchReceiver,
  researchSettingsKey,
} from '../modules/companies/index.ts'
import {
  assessmentReceiver,
  assessmentSettingsKey,
} from '../modules/matching/index.ts'
import {
  proposalReceiver,
  proposalSettingsKey,
} from '../modules/profile/index.ts'

export function registerAiJobs(registry: HandlerRegistry): void {
  registerResultReceiver(proposalSettingsKey, proposalReceiver)
  registerResultReceiver(assessmentSettingsKey, assessmentReceiver)
  registerResultReceiver(researchSettingsKey, researchReceiver)
  for (const job of [paidExecutionJob, localExecutionJob])
    registry.register(job, runExecution, endFailedExecution)
  for (const job of executorJobs())
    registry.register(
      job,
      (data) => runOperation(data),
      (data) => endFailedOperation(data),
    )
}
