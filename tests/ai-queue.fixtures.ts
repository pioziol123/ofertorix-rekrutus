import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import {
  applyQueueConfiguration,
  readQueueConfiguration,
  stopQueues,
  type QueueConfiguration,
} from '../lib/queues/index.ts'
import {
  localExecutionJob,
  paidExecutionJob,
  runExecution,
} from '../modules/ai/index.ts'

/** The queues of AI executions: paid work and work on the local model. */
export const aiQueues = [paidExecutionJob.queue, localExecutionJob.queue]

/**
 * Prepares the two AI queues in the queue schema `queueSchema` as the
 * migration step does: runs their queue migration, then applies their
 * entries of the repository's queue configuration, or `settings` when
 * given.
 */
export async function prepareAiQueues(
  queueSchema: string,
  settings?: QueueConfiguration[string],
): Promise<void> {
  const previous = process.env.PG_BOSS_SCHEMA
  process.env.PG_BOSS_SCHEMA = queueSchema
  try {
    await createRequire(import.meta.url)(
      '../migrations/1770000000025_ai_execution_queues.cjs',
    ).up()
    const file = readQueueConfiguration()
    await applyQueueConfiguration(
      Object.fromEntries(
        aiQueues.map((queue) => [queue, settings ?? file[queue] ?? {}]),
      ),
    )
  } finally {
    if (previous === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previous
  }
}

export type AiJob = {
  id: string
  name: string
  state: string
  executionId: string
}

/**
 * The AI queues of a test, in an isolated queue schema that the queue
 * library sends to while the test runs. `start` prepares them and points
 * the queue library at them; `stop` drops them. The test carries the jobs
 * out itself with `work`, as the worker's pool process calls the job
 * handler.
 */
export function aiQueue() {
  const queueSchema = `aiq_${randomUUID().replaceAll('-', '').slice(0, 16)}`
  let previous: string | undefined
  let boss: PgBoss | undefined
  let admin: Pool | undefined

  const jobs = async (): Promise<AiJob[]> =>
    (
      await admin!.query(
        `SELECT id,name,state,data->>'executionId' AS "executionId"
         FROM ${queueSchema}.job WHERE name=ANY($1::text[])
         ORDER BY created_on,id`,
        [aiQueues],
      )
    ).rows

  return {
    queueSchema,
    async start() {
      previous = process.env.PG_BOSS_SCHEMA
      await prepareAiQueues(queueSchema)
      process.env.PG_BOSS_SCHEMA = queueSchema
      admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
      boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        schema: queueSchema,
        supervise: false,
        schedule: false,
      })
      boss.on('error', () => {})
      await boss.start()
    },
    async stop() {
      await boss?.stop({ graceful: false })
      await stopQueues()
      if (previous === undefined) delete process.env.PG_BOSS_SCHEMA
      else process.env.PG_BOSS_SCHEMA = previous
      await admin?.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin?.end()
    },
    /** Every job of the AI queues, in the order they were sent. */
    jobs,
    /** The execution of every job sent, in the order the jobs were sent. */
    async executionJobs(): Promise<string[]> {
      return (await jobs()).map((job) => job.executionId)
    },
    /** Forgets the jobs sent so far. */
    async reset() {
      await admin!.query(
        `DELETE FROM ${queueSchema}.job WHERE name=ANY($1::text[])`,
        [aiQueues],
      )
    },
    /**
     * Carries out every waiting job of the AI queues, until none is left,
     * as the worker would: a job whose handler throws fails its attempt and
     * waits for its retry delay, and does not stop the others. The first
     * failure is raised once every job ran.
     */
    async work() {
      const failures: unknown[] = []
      for (;;) {
        let ran = false
        for (const queue of aiQueues) {
          const [job] = await boss!.fetch<{ executionId: string }>(queue)
          if (!job) continue
          ran = true
          try {
            await runExecution(job.data)
            await boss!.complete(queue, job.id)
          } catch (error) {
            failures.push(error)
            await boss!.fail(queue, job.id, { message: String(error) })
          }
        }
        if (!ran) break
      }
      if (failures.length) throw failures[0]
    },
  }
}
