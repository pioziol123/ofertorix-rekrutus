import { randomUUID } from 'node:crypto'
import { db } from '../../../../lib/db.ts'
import type {
  FinishedRunStatus,
  RunTrigger,
  SyncRun,
  SyncRunStatus,
} from '../../sync-run-state.ts'

/**
 * Sync runs and their scopes. A source has at most one unfinished run: a
 * request checks for one and inserts under the source's transaction lock
 * (B5-R02). The partial unique indexes of one queued and one running run
 * per scope stay; under the lock they never conflict.
 */

type RunRow = {
  id: string
  scope_id: string
  source: string
  parameters: Record<string, unknown>
  trigger: RunTrigger
  schedule_day: string
  status: SyncRunStatus
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
  r.schedule_day::text AS schedule_day, r.status, r.pages, r.seen,
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
 * Inside a transaction: waits for, then holds until the transaction ends,
 * the lock of the source's requests, so concurrent requests of one source
 * look for its unfinished run and create one after another (B5-R02).
 */
export async function lockSourceRequests(source: string): Promise<void> {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `source-sync-turn:${source}`,
  ])
}

/**
 * The source's unfinished run, of any scope: a running one first, then the
 * oldest queued one. Null when the source has none.
 *
 * ASSUMPTION(oferty-pracy-2ba.5/ASM-1): a source may still hold several
 * unfinished runs requested before B5; a request returns the running one,
 * else the oldest queued one.
 */
export async function findUnfinishedRunId(
  source: string,
): Promise<string | null> {
  const result = await db().query<{ id: string }>(
    `SELECT r.id FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.source=$1 AND r.status IN ('queued','running')
    ORDER BY r.status='running' DESC, r.created_at, r.id LIMIT 1`,
    [source],
  )
  return result.rows[0]?.id ?? null
}

/** Inserts a queued run of the scope and returns its id. */
export async function insertQueuedRun(run: {
  scopeId: string
  trigger: RunTrigger
  scheduleDay: string
}): Promise<string> {
  const id = randomUUID()
  await db().query(
    'INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day) VALUES ($1,$2,$3,$4)',
    [id, run.scopeId, run.trigger, run.scheduleDay],
  )
  return id
}

/**
 * Moves a queued run to running, or leaves a running run running for the
 * attempt that takes it over, in one conditional write. Null, without
 * changes, when the run has finished or does not exist.
 */
export async function markRunStarted(runId: string): Promise<SyncRun | null> {
  const result = await db().query<RunRow>(
    `WITH started AS (
      UPDATE source_sync_runs SET status='running',
        started_at=CASE WHEN status='queued' THEN now() ELSE started_at END
      WHERE id=$1 AND status IN ('queued','running')
      RETURNING *
    ) SELECT ${runColumns} FROM started r JOIN source_scopes s ON s.id=r.scope_id`,
    [runId],
  )
  return result.rows[0] ? toRun(result.rows[0]) : null
}

/**
 * Inside a transaction: the run while it is running, locked until the
 * transaction ends, so it cannot be finished before the transaction's
 * writes commit. Null when it is not running.
 */
export async function lockRunningRun(runId: string): Promise<SyncRun | null> {
  const result = await db().query<RunRow>(
    `WITH held AS (
      SELECT * FROM source_sync_runs WHERE id=$1 AND status='running'
      FOR UPDATE
    ) SELECT ${runColumns} FROM held r JOIN source_scopes s ON s.id=r.scope_id`,
    [runId],
  )
  return result.rows[0] ? toRun(result.rows[0]) : null
}

/**
 * Finishes the run while its status is one of `from`. False when nothing
 * changed.
 */
export async function markRunFinished(
  runId: string,
  outcome: {
    status: FinishedRunStatus
    error: string | null
    diagnostics: unknown
  },
  from: readonly SyncRunStatus[],
): Promise<boolean> {
  const result = await db().query(
    `UPDATE source_sync_runs SET status=$2, error=$3, diagnostics=$4, finished_at=now()
    WHERE id=$1 AND status = ANY($5::text[])`,
    [
      runId,
      outcome.status,
      outcome.error,
      outcome.diagnostics === undefined || outcome.diagnostics === null
        ? null
        : JSON.stringify(outcome.diagnostics),
      [...from],
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

/**
 * Inside a transaction: waits for, then holds until the transaction ends,
 * the lock of one schedule occurrence (source and schedule day), so parallel
 * schedule cycles check and request it one after another.
 */
export async function lockScheduleOccurrence(
  source: string,
  scheduleDay: string,
): Promise<void> {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `source-schedule:${source}:${scheduleDay}`,
  ])
}

/** Whether the scope has a run requested by the schedule for the day. */
export async function hasScheduledRun(
  fingerprint: string,
  scheduleDay: string,
): Promise<boolean> {
  const result = await db().query(
    `SELECT 1 FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.fingerprint=$1 AND r.trigger='scheduled' AND r.schedule_day=$2::date LIMIT 1`,
    [fingerprint, scheduleDay],
  )
  return result.rowCount === 1
}

/**
 * A run as the status reads have always shown it: the stored columns under
 * their stored names, and the scope parameters when read for a scope.
 */
export type RunRecord = {
  id: string
  scope_id: string
  trigger: RunTrigger
  schedule_day: Date
  status: SyncRunStatus
  pages: number
  seen: number
  revisions: number
  error: string | null
  diagnostics: Record<string, unknown> | null
  created_at: Date
  started_at: Date | null
  finished_at: Date | null
  /** Only when read for a scope. */
  parameters?: Record<string, unknown>
}

/**
 * The run with the id, or the latest run, of the source or, given a
 * fingerprint, of that scope, in the stored form.
 */
export async function findLatestRunRecord(filter: {
  source: string
  fingerprint?: string
  runId?: string
}): Promise<RunRecord | null> {
  const result = await db().query<RunRecord>(
    `SELECT r.* ${filter.fingerprint ? ',s.parameters' : ''}
    FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.source=$1 AND ($2::text IS NULL OR s.fingerprint=$2)
      AND ($3::uuid IS NULL OR r.id=$3::uuid)
    ORDER BY r.created_at DESC, r.id DESC LIMIT 1`,
    [filter.source, filter.fingerprint ?? null, filter.runId ?? null],
  )
  return result.rows[0] ?? null
}

/** The latest complete run of the source or, given a fingerprint, the scope. */
export async function findLatestCompleteRun(filter: {
  source: string
  fingerprint?: string
}): Promise<{ id: string; finished_at: Date } | null> {
  const result = await db().query<{ id: string; finished_at: Date }>(
    `SELECT r.id,r.finished_at FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE s.source=$1 AND ($2::text IS NULL OR s.fingerprint=$2) AND r.status='complete'
    ORDER BY r.finished_at DESC LIMIT 1`,
    [filter.source, filter.fingerprint ?? null],
  )
  return result.rows[0] ?? null
}
