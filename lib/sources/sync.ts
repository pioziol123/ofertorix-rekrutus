import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { fingerprint, hash, importQueue, scheduleDay, source } from './solid.ts'
import { syncJobOptions } from '../../modules/sources/index.ts'
import { sourceConnectors } from '../../modules/sources/infrastructure/adapters/source-connectors.ts'
import { transaction } from './store.ts'

const dispatchLock = 'solid-jobs-dispatch'
export type Run = {
  id: string
  scope_id: string
  status: string
  pages: number
  seen: number
  revisions: number
  job_id: string | null
  error: string | null
}
// The queue INSERT uses this very client, so run + job commit or roll back together.
export async function enqueueSync(
  pool: Pool,
  boss: PgBoss,
  trigger: 'manual' | 'scheduled' = 'manual',
  now = new Date(),
): Promise<{ id: string; reused: boolean } | null> {
  const day = scheduleDay(now)
  const parameters = sourceConnectors.get(source).scopeParameters()
  const client = await pool.connect()
  try {
    return await transaction(client, async () => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        dispatchLock,
      ])
      const scope = await client.query<{ id: string }>(
        `INSERT INTO source_scopes(id,source,fingerprint,parameters)
        VALUES ($1,$2,$3,$4) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id`,
        [randomUUID(), source, hash(parameters), parameters],
      )
      const scopeId = scope.rows[0]!.id
      const active = await client.query<{ id: string }>(
        `SELECT id FROM source_sync_runs WHERE scope_id=$1 AND status IN ('queued','running')`,
        [scopeId],
      )
      if (active.rows[0]) return { id: active.rows[0].id, reused: true }
      if (trigger === 'scheduled') {
        const previous = await client.query(
          `SELECT 1 FROM source_sync_runs WHERE scope_id=$1 AND schedule_day >= $2::date LIMIT 1`,
          [scopeId, day],
        )
        if (previous.rowCount) return null
      }
      const id = randomUUID()
      await client.query(
        `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day) VALUES ($1,$2,$3,$4)`,
        [id, scopeId, trigger, day],
      )
      const jobId = await boss.send(
        importQueue,
        { runId: id },
        {
          db: { executeSql: (text, values) => client.query(text, values) },
          ...syncJobOptions,
        },
      )
      if (!jobId) throw new Error('Import job was not queued')
      await client.query('UPDATE source_sync_runs SET job_id=$2 WHERE id=$1', [
        id,
        jobId,
      ])
      return { id, reused: false }
    })
  } finally {
    client.release()
  }
}

export async function syncStatus(pool: Pool, id?: string) {
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new Error('Invalid run UUID')
  const run = await pool.query(
    `SELECT r.*,s.parameters FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.fingerprint=$1 ${id ? 'AND r.id=$2' : ''} ORDER BY r.created_at DESC LIMIT 1`,
    id ? [fingerprint, id] : [fingerprint],
  )
  const full = await pool.query(
    `SELECT r.id,r.finished_at FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.fingerprint=$1 AND r.status='complete' ORDER BY r.finished_at DESC LIMIT 1`,
    [fingerprint],
  )
  return { run: run.rows[0] ?? null, lastComplete: full.rows[0] ?? null }
}
