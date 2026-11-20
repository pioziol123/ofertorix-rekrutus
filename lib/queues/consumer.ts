import type { PgBoss } from 'pg-boss'
import { queueClient } from './connection.ts'
import {
  failureQueueOf,
  failureQueueSuffix,
  type AnyJobDefinition,
} from './definition.ts'

/** One attempt of a job, as the worker carries it out. */
export type TakenJob = {
  readonly id: string
  /** Identifies the attempt; every settle is fenced to it. */
  readonly retryCount: number
  /** The queue the job was taken from. */
  readonly queue: string
  /** The name of the job definition the job belongs to. */
  readonly definition: string
  /** A copy in the failure queue: carried out by the failure handler. */
  readonly failureCopy: boolean
  readonly data: object
  readonly timeLimitSeconds: number
}

/** Why the worker failed an attempt; recorded with the job. */
export type FailureReason = {
  reason:
    | 'error'
    | 'silent'
    | 'time-limit'
    | 'taken-over'
    | 'unconfirmed'
    | 'shutdown'
    // ASSUMPTION(oferty-pracy-2ba.1/ASM-4): a process that exits by itself.
    | 'exited'
  message: string
}

/** What the worker needs from the queue to carry out jobs. */
export type JobSource = {
  /** The next job of the definitions' queues, each time from the next queue. */
  next(): Promise<TakenJob | null>
  /** Sends the job heartbeat; false when the job no longer belongs to the attempt. */
  confirm(job: TakenJob): Promise<boolean>
  complete(job: TakenJob): Promise<void>
  fail(job: TakenJob, reason: FailureReason): Promise<void>
  /** Ends the job without further attempts. */
  cancel(job: TakenJob): Promise<void>
}

/**
 * A job source over the queue and failure queue of every definition, taken
 * in turn so that no queue starves the others (B1-R07).
 */
export function openJobSource(
  definitions: readonly AnyJobDefinition[],
  client: () => Promise<PgBoss> = queueClient,
): JobSource {
  const queues = definitions.flatMap((definition) => [
    definition.queue,
    failureQueueOf(definition.queue),
  ])
  let cursor = 0
  const attempt = (job: TakenJob) => ({
    id: job.id,
    retryCount: job.retryCount,
  })
  return {
    async next() {
      const boss = await client()
      for (let offset = 0; offset < queues.length; offset++) {
        const index = (cursor + offset) % queues.length
        const queue = queues[index]!
        const [job] = await boss.fetch<object>(queue)
        if (!job) continue
        cursor = index + 1
        const failureCopy = queue.endsWith(failureQueueSuffix)
        return {
          id: job.id,
          retryCount: job.retryCount,
          queue,
          definition: failureCopy
            ? queue.slice(0, -failureQueueSuffix.length)
            : queue,
          failureCopy,
          data: job.data ?? {},
          timeLimitSeconds: job.expireInSeconds,
        }
      }
      return null
    },
    async confirm(job) {
      const boss = await client()
      const { affected } = (await boss.touch(job.queue, attempt(job))) as {
        affected: number
      }
      return affected > 0
    },
    async complete(job) {
      const boss = await client()
      await boss.complete(job.queue, attempt(job))
    },
    async fail(job, reason) {
      const boss = await client()
      await boss.fail(job.queue, attempt(job), reason)
    },
    async cancel(job) {
      const boss = await client()
      await boss.cancel(job.queue, attempt(job))
    },
  }
}
