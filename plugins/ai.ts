/**
 * The AI module plugin: registers the jobs of paid work and of work on the
 * local model with the same job handler and failure handler (B6-R02,
 * B6-R07), and the result receivers of the modules that request AI work,
 * which the handler delivers to.
 */
import type { HandlerRegistry } from '../lib/workers/index.ts'
import {
  endFailedExecution,
  localExecutionJob,
  paidExecutionJob,
  registerResultReceiver,
  runExecution,
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
}
