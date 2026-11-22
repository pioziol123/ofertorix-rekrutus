import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createQueue, stopQueues } from '../lib/queues/index.ts'
import { executorJobs } from '../modules/ai/index.ts'

/** The queues of the executors of assignments. */
export const executorQueues = executorJobs().map((job) => job.queue)

export type ExecutorJob = {
  id: string
  name: string
  state: string
  operationId: string
}

/**
 * The executors' queues of a test, in an isolated queue schema that the
 * queue library sends to while the test runs. `start` creates them and
 * points the queue library at them; `stop` drops them. The test carries
 * the operations out itself.
 */
export function aiQueue() {
  const queueSchema = `aiq_${randomUUID().replaceAll('-', '').slice(0, 16)}`
  let previous: string | undefined
  let admin: Pool | undefined

  return {
    queueSchema,
    async start() {
      previous = process.env.PG_BOSS_SCHEMA
      process.env.PG_BOSS_SCHEMA = queueSchema
      for (const job of executorJobs())
        await createQueue(job.queue, 'exclusivity')
      admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    },
    async stop() {
      await stopQueues()
      if (previous === undefined) delete process.env.PG_BOSS_SCHEMA
      else process.env.PG_BOSS_SCHEMA = previous
      await admin?.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin?.end()
    },
    /** Every job of the executors' queues, in the order they were sent. */
    async jobs(): Promise<ExecutorJob[]> {
      return (
        await admin!.query(
          `SELECT id,name,state,data->>'operationId' AS "operationId"
           FROM ${queueSchema}.job WHERE name=ANY($1::text[])
           ORDER BY created_on,id`,
          [executorQueues],
        )
      ).rows
    },
    /** Forgets the jobs sent so far. */
    async reset() {
      await admin!.query(
        `DELETE FROM ${queueSchema}.job WHERE name=ANY($1::text[])`,
        [executorQueues],
      )
    },
  }
}
