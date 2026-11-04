import { createPool } from '../lib/db.ts'
import { syncHimalayas } from '../lib/sources/himalayas-sync.ts'

const pool = createPool()
try {
  if (process.argv.length > 2) throw new Error('Unexpected arguments')
  const result = await syncHimalayas(pool)
  console.info(JSON.stringify(result, null, 2))
  if (result.status !== 'complete') process.exitCode = 1
} catch {
  console.error('Himalayas pilot failed; inspect source run status')
  process.exitCode = 1
} finally {
  await pool.end()
}
