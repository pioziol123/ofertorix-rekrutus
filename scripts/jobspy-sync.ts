import { setTimeout as delay } from 'node:timers/promises'
import { closePool, getPool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import { enqueueJobspy, jobspyStatus } from '../lib/sources/jobspy-sync.ts'
import { parseJobspySource } from '../lib/sources/jobspy-catalog.ts'
import { jobspyEnabled } from '../lib/sources/jobspy.ts'

const pool = getPool()
const boss = createBoss()
boss.on('error', () => {
  console.error('JobSpy queue error')
})
try {
  const args = process.argv.slice(2)
  const sourceIndex = args.indexOf('--source')
  const source = parseJobspySource(
    sourceIndex < 0 ? 'indeed' : (args[sourceIndex + 1] ?? ''),
  )
  const remaining = args.filter(
    (_, index) =>
      sourceIndex < 0 || (index !== sourceIndex && index !== sourceIndex + 1),
  )
  if (remaining.some((arg) => arg !== '--wait'))
    throw new Error('Usage: jobspy:sync [--source source] [--wait]')
  if (!jobspyEnabled(source)) throw new Error('JobSpy source is disabled')
  await boss.start()
  const result = await enqueueJobspy(pool, boss, new Date(), source)
  console.info(JSON.stringify(result))
  if (args.includes('--wait')) {
    const deadline = Date.now() + 150_000
    let finished = false
    while (Date.now() < deadline) {
      const status = await jobspyStatus(pool, result.id, source)
      if (status.run && !['queued', 'running'].includes(status.run.status)) {
        console.info(JSON.stringify(status, null, 2))
        if (status.run.status !== 'complete') process.exitCode = 1
        finished = true
        break
      }
      await delay(1000)
    }
    if (!finished) {
      console.info('Still pending; use jobspy:status')
      process.exitCode = 2
    }
  }
} catch (error) {
  console.error(
    error instanceof Error &&
      (error.message.startsWith('Usage:') ||
        error.message === 'JobSpy source is disabled')
      ? error.message
      : 'Could not request JobSpy import',
  )
  process.exitCode = 1
} finally {
  await boss.stop()
  await closePool()
}
