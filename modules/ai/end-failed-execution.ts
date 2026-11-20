import { transaction } from '../../lib/db.ts'
import { sendExecutionJob, type ExecutionJobData } from './execution-jobs.ts'
import {
  readExecutionRow,
  unfinishedExecutions,
} from './infrastructure/persistence/executions.ts'
import { endAsUnknown } from './run-execution.ts'

/**
 * The failure handler of both AI queues (B6-R07), called through the
 * failure queue after the job's last attempt failed, also when the worker
 * died in it (B1-D10). An execution that waits for work or runs ends as
 * uncertain with the cause unknown, keeping its reservation, and the job
 * that delivers that end is sent. An execution waiting for delivery stays
 * so, and any other is left as it is. A conditional write, so a repeated
 * call has no further effect.
 */
export async function endFailedExecution({
  executionId,
}: ExecutionJobData): Promise<void> {
  await transaction(async () => {
    const execution = await readExecutionRow(executionId)
    if (execution?.state === 'queued' || execution?.state === 'running')
      await endAsUnknown(execution, ['queued', 'running'])
  })
}

/**
 * Carries the unfinished executions over to the queues of the queue
 * library at deployment (B6-R10, B6-D04): every execution that waits for
 * work, runs or waits for delivery gets one job, in the order the
 * executions were requested, each in its own transaction so that each job
 * is created later than the one before. The job carries a waiting one out,
 * ends a running one as uncertain (B6-R05) and delivers one waiting for
 * delivery. Executions waiting for budget are not touched. Returns the
 * number of jobs sent.
 */
export async function requestUnfinishedExecutions(): Promise<number> {
  const executions = await unfinishedExecutions()
  for (const execution of executions)
    await transaction(() =>
      sendExecutionJob(execution.id, execution.snapshot.settings),
    )
  return executions.length
}
