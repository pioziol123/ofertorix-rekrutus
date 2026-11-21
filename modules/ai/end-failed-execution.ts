import { transaction } from '../../lib/db.ts'
import type { ExecutionJobData } from './execution-jobs.ts'
import { readExecutionRow } from './infrastructure/persistence/executions.ts'
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
