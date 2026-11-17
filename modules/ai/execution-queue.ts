import type { PgBoss } from 'pg-boss'
import { queueDatabase } from '../../lib/db.ts'
import { requireQueued } from '../../lib/queue.ts'

/** The AI execution queue; its jobs carry only the execution identifier. */
export const aiExecutionQueue = 'ai-execution'
/**
 * A job fails only when the delivery of a saved outcome fails; its retries
 * deliver again without calling the provider. After the last one the
 * execution stays waiting for delivery.
 */
export const aiExecutionJobOptions = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 300,
}

let queue: PgBoss | undefined

/** Connects the AI coordination to the process's queue client. */
export function useAiQueue(boss: PgBoss): void {
  queue = boss
}

function boss(): PgBoss {
  if (!queue) throw new Error('The AI execution queue is not connected')
  return queue
}

/** Sends the execution's job in the current transaction. */
export async function sendExecutionJob(executionId: string) {
  await requireQueued(
    boss().send(
      aiExecutionQueue,
      { executionId },
      { ...aiExecutionJobOptions, db: queueDatabase },
    ),
  )
}

/** Sends the job again; a duplicate is harmless because a claim is conditional. */
export async function resendExecutionJob(executionId: string) {
  await boss().send(
    aiExecutionQueue,
    { executionId },
    {
      ...aiExecutionJobOptions,
      singletonKey: executionId,
      singletonSeconds: 60,
    },
  )
}
