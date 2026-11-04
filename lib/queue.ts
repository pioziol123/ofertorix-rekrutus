import { PgBoss } from 'pg-boss'

export const smokeQueue = 'system-smoke'

export function createBoss(migrate = false): PgBoss {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  return new PgBoss({
    connectionString,
    migrate,
    schema: process.env.PG_BOSS_SCHEMA ?? 'pgboss',
  })
}

export async function requireQueued(
  job: Promise<string | null>,
): Promise<string> {
  const id = await job
  if (!id) throw new Error('Queue did not accept the job')
  return id
}
