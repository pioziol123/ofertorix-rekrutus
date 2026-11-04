import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { PgBoss } from 'pg-boss'
import { hash, scheduleDay } from './solid.ts'
import { saveOffers, transaction } from './store.ts'
import {
  jobspyEnabled,
  fingerprintFor,
  parametersFor,
  queueFor,
  parseJobspy,
  runJobspy,
} from './jobspy.ts'
import {
  jobspyCatalog,
  jobspySources,
  type JobspySource,
} from './jobspy-catalog.ts'

const executionLock = (source: JobspySource) => `${source}-jobspy-execution`
const sourceCondition =
  'scope_id IN (SELECT id FROM source_scopes WHERE source=$1)'
async function fail(client: PoolClient, id: string, message: string) {
  await client.query(
    `UPDATE source_sync_runs SET status=CASE WHEN seen>0 THEN 'partial' ELSE 'failed' END,
    error=$2,finished_at=now() WHERE id=$1 AND status IN ('queued','running')`,
    [id, message],
  )
}
async function recoverLocked(
  client: PoolClient,
  boss: PgBoss,
  source: JobspySource,
) {
  await client.query(
    `UPDATE source_sync_runs SET status=CASE WHEN seen>0 THEN 'partial' ELSE 'failed' END,
    error='JobSpy worker interrupted; request a new import',finished_at=now()
    WHERE status='running' AND ${sourceCondition}`,
    [source],
  )
  const runs = await client.query<{ id: string; job_id: string | null }>(
    `SELECT id,job_id FROM source_sync_runs WHERE status='queued' AND ${sourceCondition}`,
    [source],
  )
  for (const run of runs.rows) {
    const job = run.job_id
      ? await boss.getJobById(queueFor(source), run.job_id)
      : null
    if (!job || ['failed', 'cancelled', 'completed'].includes(job.state))
      await fail(
        client,
        run.id,
        'JobSpy queue delivery ended; request a new import',
      )
  }
}
export async function enqueueJobspy(
  pool: Pool,
  boss: PgBoss,
  now = new Date(),
  source: JobspySource = 'indeed',
) {
  if (!jobspyEnabled(source)) throw new Error('JobSpy source is disabled')
  const client = await pool.connect()
  try {
    return await transaction(client, async () => {
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
        [randomUUID(), source, fingerprintFor(source), parametersFor(source)],
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
          db: { executeSql: (text, values) => client.query(text, values) },
          retryLimit: 0,
          expireInSeconds: 300,
        },
      )
      if (!jobId) throw new Error('JobSpy job was not queued')
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

export async function recoverJobspy(
  pool: Pool,
  boss: PgBoss,
  source: JobspySource = 'indeed',
) {
  const client = await pool.connect()
  let locked = false
  try {
    locked = (
      await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [executionLock(source)],
      )
    ).rows[0]!.locked
    if (locked) await recoverLocked(client, boss, source)
  } finally {
    try {
      if (locked)
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          executionLock(source),
        ])
    } finally {
      client.release()
    }
  }
}

export async function executeJobspy(
  pool: Pool,
  boss: PgBoss,
  runId: string,
  collect?: () => Promise<unknown>,
  source: JobspySource = 'indeed',
) {
  const client = await pool.connect()
  let locked = false,
    lost = false
  const disconnected = () => {
    lost = true
  }
  client.on('error', disconnected)
  try {
    locked = (
      await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [executionLock(source)],
      )
    ).rows[0]!.locked
    if (!locked) return
    await recoverLocked(client, boss, source)
    const claimed = await client.query<{ id: string; scope_id: string }>(
      `UPDATE source_sync_runs SET status='running',started_at=now()
      WHERE id=$2 AND status='queued' AND ${sourceCondition} RETURNING id,scope_id`,
      [source, runId],
    )
    const run = claimed.rows[0]
    if (!run) return
    try {
      if (!jobspyEnabled(source)) throw new Error('JobSpy source is disabled')
      const scope = await client.query(
        'SELECT parameters FROM source_scopes WHERE id=$1',
        [run.scope_id],
      )
      if (hash(scope.rows[0]?.parameters) !== fingerprintFor(source))
        throw new Error('Invalid JobSpy result')
      const batch = parseJobspy(
        await (collect ?? (() => runJobspy({ source })))(),
        source,
      )
      if (lost) throw new Error('Database session lost')
      await saveOffers(client, run, batch.jobs, source)
      await client.query(
        `UPDATE source_sync_runs SET status=$2,error=$3,diagnostics=$4,finished_at=now() WHERE id=$1`,
        [run.id, batch.status, batch.error, batch.diagnostics],
      )
    } catch (error) {
      const safe = new Set([
        'JobSpy source is disabled',
        'Invalid JobSpy result',
        'JobSpy process timed out',
        'JobSpy output limit exceeded',
        'JobSpy process could not start',
        'JobSpy process failed',
        'Invalid JobSpy process output',
      ])
      await fail(
        client,
        run.id,
        error instanceof Error && safe.has(error.message)
          ? error.message
          : 'JobSpy import failed',
      )
    }
  } finally {
    client.off('error', disconnected)
    try {
      if (locked && !lost)
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          executionLock(source),
        ])
    } finally {
      client.release(lost)
    }
  }
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
