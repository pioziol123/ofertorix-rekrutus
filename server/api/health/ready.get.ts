import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../../../lib/db'

let newest: string | undefined

/** The name node-pg-migrate records for the newest migration file. */
function newestMigration(): string {
  newest ??= readdirSync(resolve('migrations'))
    .filter((file) => /\.c?js$/.test(file))
    .map((file) => file.replace(/\.c?js$/, ''))
    .sort()
    .at(-1)
  if (!newest) throw new Error('No migrations found')
  return newest
}

// Ready when the database answers and the newest migration is applied
// (B1-R16).
export default defineEventHandler(async () => {
  try {
    const { rowCount } = await db().query(
      'SELECT 1 FROM pgmigrations WHERE name = $1',
      [newestMigration()],
    )
    if (rowCount === 1) return { status: 'ready' }
  } catch {
    // Reported as not ready below.
  }
  throw createError({ statusCode: 503, statusMessage: 'Service not ready' })
})
