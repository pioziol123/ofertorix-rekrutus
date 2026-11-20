import { sendJob, defineJob } from '../../lib/queues/index.ts'
import type { ExecutionSettings } from './execution-settings.ts'
import { providerAdapter } from './provider-registry.ts'

/** What a job of an AI execution carries: only the execution's identifier. */
export type ExecutionJobData = { executionId: string }

/**
 * The job of paid AI work. Exclusivity with a constant key: at most one
 * paid execution is carried out at a time in the whole system (B6-R02,
 * B6-D01). Its queue is created by a queue migration with the same key mode;
 * the queue configuration gives its attempts and time limit (B6-R04).
 */
export const paidExecutionJob = defineJob<ExecutionJobData>({
  queue: 'ai-execution-paid',
  key: { mode: 'exclusivity', value: 'ai-execution-paid' },
})

/**
 * The job of work on the local model: one at a time, in the order its jobs
 * were sent, which is the order the executions were requested (B6-R02).
 */
export const localExecutionJob = defineJob<ExecutionJobData>({
  queue: 'ai-execution-local',
  key: { mode: 'exclusivity', value: 'ai-execution-local' },
})

/** The job definitions of AI executions, both carried out the same way. */
export const executionJobs = [paidExecutionJob, localExecutionJob] as const

/**
 * Sends the execution's job in the current transaction, on the queue of
 * the local model when the provider's adapter runs on the shared local
 * model, otherwise on the queue of paid work. A job that the queue does
 * not accept throws, which rolls the caller back (B6-R01).
 */
export async function sendExecutionJob(
  executionId: string,
  settings: Pick<ExecutionSettings, 'provider'>,
): Promise<void> {
  const local = providerAdapter(settings.provider)?.sharedSlot === true
  await sendJob(local ? localExecutionJob : paidExecutionJob, { executionId })
}
