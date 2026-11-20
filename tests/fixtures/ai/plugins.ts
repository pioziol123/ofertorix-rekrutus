/**
 * The plugins index of the AI tests: the AI module plugin as the worker
 * runs it, with the simulated providers and the test receivers. Its job
 * handler first fails, before handling the execution, as many times as the
 * test listed for it, as when the database is unavailable, so that a job
 * can fail finally while its execution waits or, in the last attempt, runs.
 */
import { Pool } from 'pg'
import { runPlugins, type HandlerRegistry } from '../../../lib/workers/index.ts'
import {
  endFailedExecution,
  localExecutionJob,
  paidExecutionJob,
  runExecution,
  type ExecutionJobData,
} from '../../../modules/ai/index.ts'
import {
  registerSimulatedProviders,
  registerTestReceivers,
} from './simulated.ts'

const records = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

async function handle(data: ExecutionJobData) {
  const failing = await records.query(
    'UPDATE handler_failures SET remaining=remaining-1 WHERE execution_id=$1 AND remaining>0 RETURNING remaining',
    [data.executionId],
  )
  if (failing.rowCount) throw new Error('Handler failed before handling')
  await runExecution(data)
}

export async function runModulePlugins(registry: HandlerRegistry) {
  await runPlugins(
    {
      ai: (registry) => {
        registerSimulatedProviders()
        registerTestReceivers()
        for (const job of [paidExecutionJob, localExecutionJob])
          registry.register(job, handle, endFailedExecution)
      },
    },
    registry,
  )
}
