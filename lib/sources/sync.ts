import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { PgBoss } from 'pg-boss'
import { fingerprint, hash, importQueue, scheduleDay, source } from './solid.ts'
import { ConnectorError } from '../../modules/sources/infrastructure/adapters/connector.ts'
import {
  createSolidJobsConnector,
  type SolidJobsPageFetcher,
} from '../../modules/sources/infrastructure/adapters/solid-jobs/connector.ts'
import { transaction, saveOffers } from './store.ts'

const dispatchLock = 'solid-jobs-dispatch'
const executionLock = 'solid-jobs-execution'
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
  const parameters = createSolidJobsConnector().scopeParameters()
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
          retryLimit: 0,
          expireInSeconds: 3600,
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

async function failRun(client: PoolClient, id: string, error: string) {
  await client.query(
    `UPDATE source_sync_runs SET status=CASE WHEN pages>0 THEN 'partial' ELSE 'failed' END,
    error=$2,finished_at=now() WHERE id=$1 AND status IN ('queued','running')`,
    [id, error],
  )
}

// Called only while holding the execution lock: another worker cannot own a running run.
async function recoverLocked(client: PoolClient, boss: PgBoss) {
  await client.query(
    `UPDATE source_sync_runs SET status=CASE WHEN pages>0 THEN 'partial' ELSE 'failed' END,
    error='Worker interrupted; request a new import',finished_at=now() WHERE status='running'
    AND scope_id IN (SELECT id FROM source_scopes WHERE source=$1)`,
    [source],
  )
  const queued = await client.query<Run>(
    `SELECT * FROM source_sync_runs WHERE status='queued' AND scope_id IN (SELECT id FROM source_scopes WHERE source=$1)`,
    [source],
  )
  for (const run of queued.rows) {
    const job = run.job_id
      ? await boss.getJobById(importQueue, run.job_id)
      : null
    if (!job || ['failed', 'cancelled', 'completed'].includes(job.state)) {
      await failRun(
        client,
        run.id,
        'Queue delivery ended; request a new import',
      )
    }
  }
}

export async function recoverSync(pool: Pool, boss: PgBoss): Promise<void> {
  const client = await pool.connect()
  try {
    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [executionLock],
    )
    if (!lock.rows[0]!.locked) return
    try {
      await recoverLocked(client, boss)
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        executionLock,
      ])
    }
  } finally {
    client.release()
  }
}

export async function executeSync(
  pool: Pool,
  boss: PgBoss,
  runId: string,
  fetchPage?: SolidJobsPageFetcher,
): Promise<void> {
  const connector = createSolidJobsConnector(fetchPage)
  const client = await pool.connect()
  let locked = false
  // pg emits asynchronous errors on loss of a checked-out session; stop writing if its lock is lost.
  let connectionLost = false
  const lost = () => {
    connectionLost = true
  }
  client.on('error', lost)
  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [executionLock],
    )
    locked = result.rows[0]!.locked
    // A duplicate delivery must never fail the run owned by the lock holder.
    // A different queued run is reconciled after this delivery ends.
    if (!locked) return
    await recoverLocked(client, boss)
    const claimed = await client.query<Run>(
      `UPDATE source_sync_runs SET status='running',started_at=now()
      WHERE id=$1 AND status='queued' AND scope_id IN (SELECT id FROM source_scopes WHERE source=$2) RETURNING *`,
      [runId, source],
    )
    const run = claimed.rows[0]
    if (!run) return // Late delivery of a recovered or already finished job.
    try {
      const outcome = await connector.fetch(
        connector.scopeParameters(),
        async (ads) => {
          if (connectionLost) throw new Error('Database session lost')
          await saveOffers(
            client,
            run,
            ads.map((ad) => ad.content),
            source,
          )
        },
        new AbortController().signal,
      )
      if (!outcome.complete) {
        await failRun(client, run.id, outcome.reason)
        return
      }
      await transaction(client, async () => {
        await client.query(
          `UPDATE source_ads a SET availability='unavailable'
          WHERE source=$1 AND last_seen_scope_id=$2
          AND NOT EXISTS (SELECT 1 FROM source_run_seen s WHERE s.run_id=$3 AND s.source_ad_id=a.id)`,
          [source, run.scope_id, run.id],
        )
        await client.query(
          `UPDATE source_sync_runs SET status='complete',finished_at=now() WHERE id=$1`,
          [run.id],
        )
      })
    } catch (error) {
      // Only connector errors are exposed; never persist credentials or raw response bodies.
      const message =
        error instanceof ConnectorError
          ? error.message
          : 'Import interrupted by a storage or processing error'
      await failRun(client, run.id, message)
    }
  } finally {
    client.off('error', lost)
    try {
      if (locked && !connectionLost)
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          executionLock,
        ])
    } finally {
      client.release(connectionLost)
    }
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
