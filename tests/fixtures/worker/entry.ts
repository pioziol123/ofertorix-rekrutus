/**
 * A worker entry for tests: the worker library with the test plugins index,
 * taking every queue of the queue schema as in production (B1-D16). Unless
 * one of these is set, the job source is the queue library's own:
 * `TEST_NEVER_CONFIRM=1` makes the queue never confirm the attempts
 * of jobs whose id starts with `unconfirmed`; `TEST_DELAY_NEXT_MS` holds each
 * taken job that long before handing it to the worker; `TEST_HANG_NEXT=1`
 * makes taking a job never end, as a stuck fetch would.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { closePool } from '../../../lib/db.ts'
import type { JobSource } from '../../../lib/queues/index.ts'
import { startWorker } from '../../../lib/workers/index.ts'

const worker = await startWorker({
  plugins: fileURLToPath(new URL('./plugins.ts', import.meta.url)),
  jobSource: (source: JobSource): JobSource => {
    const delay = Number(process.env.TEST_DELAY_NEXT_MS ?? 0)
    return {
      ...source,
      next:
        process.env.TEST_HANG_NEXT === '1'
          ? () => new Promise<null>(() => {})
          : async () => {
              const job = await source.next()
              if (job && delay) await sleep(delay)
              return job
            },
      confirm: (job) =>
        process.env.TEST_NEVER_CONFIRM === '1' &&
        (job.data as { id: string }).id.startsWith('unconfirmed')
          ? new Promise<boolean>(() => {})
          : source.confirm(job),
    }
  },
})
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void worker
      .stop()
      .then(closePool)
      .then(() => process.exit(0))
  })
