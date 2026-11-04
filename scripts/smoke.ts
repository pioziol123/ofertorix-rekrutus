import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { createPool } from '../lib/db.ts'
import { createBoss, smokeQueue } from '../lib/queue.ts'

const pool = createPool()
const boss = createBoss()
const checkId = randomUUID()
try {
  await boss.start()
  await boss.send(smokeQueue, { checkId })
  const deadline = Date.now() + 30_000
  let complete = false
  while (Date.now() < deadline) {
    const { rowCount } = await pool.query(
      'SELECT id FROM system_checks WHERE id = $1',
      [checkId],
    )
    if (rowCount === 1) {
      complete = true
      break
    }
    await setTimeout(250)
  }
  if (!complete)
    throw new Error('Worker did not complete the smoke job within 30 seconds')
  console.info(`Smoke job completed: ${checkId}`)
} finally {
  await boss.stop()
  await pool.end()
}
