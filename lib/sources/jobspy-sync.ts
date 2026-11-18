import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { hash, scheduleDay } from './solid.ts'
import { syncJobOptions } from '../../modules/sources/index.ts'
import { sourceConnectors } from '../../modules/sources/infrastructure/adapters/source-connectors.ts'
import { db, queueDatabase, transaction } from '../db.ts'
import { jobspyEnabled, queueFor } from './jobspy.ts'
import {
  jobspyCatalog,
  jobspySources,
  type JobspySource,
} from './jobspy-catalog.ts'

const sourceCondition =
  'scope_id IN (SELECT id FROM source_scopes WHERE source=$1)'
export async function enqueueJobspy(
  boss: PgBoss,
  now = new Date(),
  source: JobspySource = 'indeed',
) {
  if (!jobspyEnabled(source)) throw new Error('JobSpy source is disabled')
  const parameters = sourceConnectors.get(source).scopeParameters()
  return transaction(async () => {
    const client = db()
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${source}-jobspy-dispatch`,
    ])
    const active = await client.query<{ id: string }>(
      `SELECT id FROM source_sync_runs
        WHERE status IN ('queued','running') AND ${sourceCondition}`,
      [source],
    )
    if (active.rows[0]) return { id: active.rows[0].id, reused: true }
    const scope = await client.query<{ id: string }>(
      `INSERT INTO source_scopes(id,source,fingerprint,parameters)
        VALUES ($1,$2,$3,$4) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id`,
      [randomUUID(), source, hash(parameters), parameters],
    )
    const id = randomUUID()
    await client.query(
      `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day) VALUES ($1,$2,'manual',$3)`,
      [id, scope.rows[0]!.id, scheduleDay(now)],
    )
    const jobId = await boss.send(
      queueFor(source),
      { runId: id },
      {
        db: queueDatabase,
        ...syncJobOptions,
      },
    )
    if (!jobId) throw new Error('JobSpy job was not queued')
    await client.query('UPDATE source_sync_runs SET job_id=$2 WHERE id=$1', [
      id,
      jobId,
    ])
    return { id, reused: false }
  })
}

export async function jobspyStatus(
  pool: Pool,
  id?: string,
  source: JobspySource = 'indeed',
) {
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new Error('Invalid run UUID')
  const result = await pool.query<{
    id: string
    status: string
    error: string | null
    seen: number
    revisions: number
    finished_at: Date | null
    diagnostics: Record<string, unknown> | null
  }>(
    `SELECT r.* FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.source=$1 ${id ? 'AND r.id=$2' : ''} ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,
    id ? [source, id] : [source],
  )
  return {
    enabled: jobspyEnabled(source),
    scheduled: false,
    run: result.rows[0] ?? null,
  }
}

export async function jobspyCatalogStatus(pool: Pool) {
  const sources = await Promise.all(
    jobspySources.map(async (source) => ({
      source,
      ...jobspyCatalog[source],
      connected: source !== 'google',
      ...(await jobspyStatus(pool, undefined, source)),
    })),
  )
  const indeed = sources.find((s) => s.source === 'indeed')!
  return { enabled: indeed.enabled, scheduled: false, run: indeed.run, sources }
}
