import { transaction } from '../../lib/db.ts'
import { sendExecutionJob } from './execution-jobs.ts'
import { unfinishedExecutions } from './infrastructure/persistence/executions.ts'

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
