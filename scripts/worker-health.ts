import { closePool, getPool } from '../lib/db.ts'
const pool = getPool()
try {
  const { rowCount } = await pool.query(`SELECT service FROM service_heartbeats
    WHERE service = 'worker' AND last_seen > now() - interval '30 seconds'`)
  if (rowCount !== 1) process.exitCode = 1
} catch {
  process.exitCode = 1
} finally {
  await closePool()
}
