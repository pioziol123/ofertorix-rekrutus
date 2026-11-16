import { randomUUID } from 'node:crypto'
import { db } from '../../../../lib/db.ts'
import type {
  FinishedRunStatus,
  RunTrigger,
  SyncRun,
  SyncRunStatus,
} from '../../sync-run-state.ts'

/**
 * Sync runs and their scopes. One queued and one running run per scope are
 * enforced by partial unique indexes (F2-07); this repository relies on them
 * instead of locks.
 */

type RunRow = {
  id: string
  scope_id: string
  source: string
  parameters: Record<string, unknown>
  trigger: RunTrigger
  schedule_day: string
  status: SyncRunStatus
  job_id: string | null
  pages: number
  seen: number
  revisions: number
  error: string | null
  diagnostics: unknown
  created_at: Date
  started_at: Date | null
  finished_at: Date | null
}

const runColumns = `r.id, r.scope_id, s.source, s.parameters, r.trigger,
  r.schedule_day::text AS schedule_day, r.status, r.job_id, r.pages, r.seen,
  r.revisions, r.error, r.diagnostics, r.created_at, r.started_at, r.finished_at`

function toRun(row: RunRow): SyncRun {
  return {
    id: row.id,
    scopeId: row.scope_id,
    source: row.source,
    parameters: row.parameters,
    trigger: row.trigger,
    scheduleDay: row.schedule_day,
    status: row.status,
    jobId: row.job_id,
    pages: row.pages,
    uniqueAds: row.seen,
    revisions: row.revisions,
    error: row.error,
    diagnostics: row.diagnostics ?? null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

/** Returns the scope id for the fingerprint, creating the scope if needed. */
export async function upsertScope(
  source: string,
  fingerprint: string,
  parameters: Record<string, unknown>,
): Promise<string> {
  const result = await db().query<{ id: string }>(
    `INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES ($1,$2,$3,$4)
    ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id`,
    [randomUUID(), source, fingerprint, parameters],
  )
  return result.rows[0]!.id
}

/**
 * Inserts a queued run unless the scope already has one. Returns the new
 * run's id, or null when the queued-run index rejected it.
 */
export async function insertQueuedRun(run: {
  scopeId: string
  trigger: RunTrigger
  scheduleDay: string
}): Promise<string | null> {
  const result = await db().query<{ id: string }>(
    `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day) VALUES ($1,$2,$3,$4)
    ON CONFLICT (scope_id) WHERE status = 'queued' DO NOTHING RETURNING id`,
    [randomUUID(), run.scopeId, run.trigger, run.scheduleDay],
  )
  return result.rows[0]?.id ?? null
}

export async function findQueuedRunId(scopeId: string): Promise<string | null> {
  const result = await db().query<{ id: string }>(
    `SELECT id FROM source_sync_runs WHERE scope_id=$1 AND status='queued'`,
    [scopeId],
  )
  return result.rows[0]?.id ?? null
}

export async function setRunJob(runId: string, jobId: string): Promise<void> {
  await db().query('UPDATE source_sync_runs SET job_id=$2 WHERE id=$1', [
    runId,
    jobId,
  ])
}

/** Moves a queued run to running; null when the run is not queued. */
export async function markRunStarted(runId: string): Promise<SyncRun | null> {
  const result = await db().query<RunRow>(
    `WITH started AS (
      UPDATE source_sync_runs SET status='running', started_at=now()
      WHERE id=$1 AND status='queued' RETURNING *
    ) SELECT ${runColumns} FROM started r JOIN source_scopes s ON s.id=r.scope_id`,
    [runId],
  )
  return result.rows[0] ? toRun(result.rows[0]) : null
}

/** Finishes a queued or running run; false when it had already finished. */
export async function markRunFinished(
  runId: string,
  outcome: {
    status: FinishedRunStatus
    error: string | null
    diagnostics: unknown
  },
): Promise<boolean> {
  const result = await db().query(
    `UPDATE source_sync_runs SET status=$2, error=$3, diagnostics=$4, finished_at=now()
    WHERE id=$1 AND status IN ('queued','running')`,
    [
      runId,
      outcome.status,
      outcome.error,
      outcome.diagnostics === undefined || outcome.diagnostics === null
        ? null
        : JSON.stringify(outcome.diagnostics),
    ],
  )
  return result.rowCount === 1
}

/** Adds one saved batch to the run's page, unique-ad and revision counters. */
export async function addBatchToRunCounters(
  runId: string,
  batch: { uniqueAds: number; revisions: number },
): Promise<void> {
  await db().query(
    'UPDATE source_sync_runs SET pages=pages+1,seen=seen+$2,revisions=revisions+$3 WHERE id=$1',
    [runId, batch.uniqueAds, batch.revisions],
  )
}

export async function findRun(runId: string): Promise<SyncRun | null> {
  const result = await db().query<RunRow>(
    `SELECT ${runColumns} FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE r.id=$1`,
    [runId],
  )
  return result.rows[0] ? toRun(result.rows[0]) : null
}

/** Queued and running runs, optionally of one source, oldest first. */
export async function findUnfinishedRuns(source?: string): Promise<SyncRun[]> {
  const result = await db().query<RunRow>(
    `SELECT ${runColumns} FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE r.status IN ('queued','running') AND ($1::text IS NULL OR s.source=$1)
    ORDER BY r.created_at, r.id`,
    [source ?? null],
  )
  return result.rows.map(toRun)
}
