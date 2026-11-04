import { setTimeout as delay } from 'node:timers/promises'
import { createPool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import { enqueueSync, syncStatus } from '../lib/sources/sync.ts'

const pool = createPool()
const boss = createBoss()
boss.on('error', () => {
  console.error('Queue connection error')
})
try {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--wait'))
    throw new Error('Usage: source:sync [--wait]')
  await boss.start()
  const result = await enqueueSync(pool, boss)
  console.info(JSON.stringify(result, null, 2))
  if (args.includes('--wait') && result) {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const status = await syncStatus(pool, result.id)
      if (status.run && !['queued', 'running'].includes(status.run.status)) {
        console.info(JSON.stringify(status, null, 2))
        if (status.run.status !== 'complete') process.exitCode = 1
        break
      }
      await delay(1000)
    }
    const status = await syncStatus(pool, result.id)
    if (status.run && ['queued', 'running'].includes(status.run.status)) {
      console.info('Still pending; inspect source:status with the run id')
      process.exitCode = 2
    }
  }
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith('Usage:')
      ? error.message
      : 'Could not request import; check worker and database',
  )
  process.exitCode = 1
} finally {
  await boss.stop()
  await pool.end()
}
