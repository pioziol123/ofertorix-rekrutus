import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createPool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import { polishQuery } from '../lib/sources/polish.ts'
import { enqueuePolish, polishStatus } from '../lib/sources/polish-sync.ts'
const pool = createPool(),
  boss = createBoss()
boss.on('error', () => console.error('Source queue unavailable'))
try {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      technology: { type: 'string', default: 'PHP' },
      seniority: { type: 'string', default: 'senior' },
      'max-offers': { type: 'string' },
      'max-pages': { type: 'string' },
      'max-requests': { type: 'string' },
      wait: { type: 'boolean', default: false },
    },
  })
  const query = polishQuery.parse({
    source: values.source,
    technology: values.technology === 'all' ? null : values.technology,
    seniority: values.seniority === 'all' ? null : values.seniority,
    ...(values['max-offers']
      ? { maxOffers: Number(values['max-offers']) }
      : {}),
    ...(values['max-pages'] ? { maxPages: Number(values['max-pages']) } : {}),
    ...(values['max-requests']
      ? { maxRequests: Number(values['max-requests']) }
      : {}),
  })
  await boss.start()
  const result = await enqueuePolish(pool, boss, query)
  console.info(JSON.stringify(result))
  if (values.wait) {
    const deadline = Date.now() + 240_000
    let finished = false
    while (Date.now() < deadline) {
      const state = await polishStatus(pool, result.id, query.source)
      if (state.run && !['queued', 'running'].includes(state.run.status)) {
        console.info(JSON.stringify(state, null, 2))
        if (state.run.status !== 'complete') process.exitCode = 1
        finished = true
        break
      }
      await delay(1000)
    }
    if (!finished) {
      console.info('Still pending; use polish:status')
      process.exitCode = 2
    }
  }
} catch {
  console.error(
    'Could not import source; check --source bulldogjob|theprotocol|justjoinit|nofluffjobs, --technology, --seniority and limits',
  )
  process.exitCode = 1
} finally {
  await boss.stop()
  await pool.end()
}
