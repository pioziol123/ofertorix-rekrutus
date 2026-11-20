/**
 * The test plugins index: one module plugin registering the test job
 * definitions, whose handlers record what they do in `worker_events`, and a
 * plugin that fails when `TEST_BROKEN_PLUGIN` asks it to.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { db } from '../../../lib/db.ts'
import { runPlugins, type HandlerRegistry } from '../../../lib/workers/index.ts'
import { registeredDefinitions, type TestJob } from './definitions.ts'

async function record(job: TestJob | null, kind: string) {
  await db().query(
    'INSERT INTO worker_events (job_id, kind, pid, data) VALUES ($1, $2, $3, $4)',
    [job?.id ?? null, kind, process.pid, job],
  )
}

async function count(job: TestJob, kind: string): Promise<number> {
  const { rows } = await db().query(
    'SELECT count(*)::int AS n FROM worker_events WHERE job_id = $1 AND kind = $2',
    [job.id, kind],
  )
  return rows[0].n
}

async function handle(job: TestJob) {
  const earlier = await count(job, 'start')
  await record(job, 'start')
  if (job.action === 'throw') throw new Error(`boom ${job.id}`)
  if (job.action === 'exit') process.exit(3)
  if (job.action === 'busy') {
    const until = Date.now() + (job.ms ?? 0)
    while (Date.now() < until) {
      // Blocks the event loop, so the process stops reporting.
    }
  } else if (job.action === 'ok' || earlier === 0) await sleep(job.ms ?? 0)
  await record(job, 'end')
}

async function handleFailure(job: TestJob) {
  if (job.failureThrowsOnce && (await count(job, 'failure-error')) === 0) {
    await record(job, 'failure-error')
    throw new Error(`failure handler of ${job.id} failed once`)
  }
  await record(job, 'failure')
}

export async function runModulePlugins(registry: HandlerRegistry) {
  await runPlugins(
    {
      test: async (registry) => {
        await record(null, 'plugin')
        for (const definition of registeredDefinitions)
          registry.register(definition, handle, handleFailure)
      },
      broken: () => {
        const broken = process.env.TEST_BROKEN_PLUGIN
        const inPool = typeof process.send === 'function'
        if (broken === 'always' || (broken === 'pool' && inPool))
          throw new Error('the test plugin cannot register')
      },
    },
    registry,
  )
}
