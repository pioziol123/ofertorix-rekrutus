import { createPool } from '../lib/db.ts'
import { syncStatus } from '../lib/sources/sync.ts'
const pool = createPool()
try {
  if (process.argv.length > 3) throw new Error('Expected at most one run UUID')
  console.info(JSON.stringify(await syncStatus(pool, process.argv[2]), null, 2))
} catch {
  console.error('Could not read import status; check run UUID and database')
  process.exitCode = 1
} finally {
  await pool.end()
}
