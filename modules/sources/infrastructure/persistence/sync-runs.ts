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
  attempt: number | null
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
  r.schedule_day::text AS schedule_day, r.status, r.job_id, r.attempt, r.pages, r.seen,
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
    attempt: row.attempt,
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
 * run's id, or null when the queued-run index rejected it. With it, the id
 * of the scope's run that was already running when the statement began (its
 * snapshot): that run cannot have blocked the insert, since the blocker was
 * queued.
 *
 * ASSUMPTION(oferty-pracy-0mq.19/ASM-1): `runningBefore` exists only so the
 * admission never returns that run in place of the blocking one.
 */
export async function insertQueuedRun(run: {
  scopeId: string
  trigger: RunTrigger
  scheduleDay: string
}): Promise<{ id: string | null; runningBefore: string | null }> {
  const result = await db().query<{
    id: string | null
    running_before: string | null
  }>(
    `WITH inserted AS (
      INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day) VALUES ($1,$2,$3,$4)
      ON CONFLICT (scope_id) WHERE status = 'queued' DO NOTHING RETURNING id
    ) SELECT (SELECT id FROM inserted) AS id,
      (SELECT id FROM source_sync_runs WHERE scope_id=$2 AND status='running')
        AS running_before`,
    [randomUUID(), run.scopeId, run.trigger, run.scheduleDay],
  )
  const row = result.rows[0]!
  return { id: row.id, runningBefore: row.running_before }
}

/**
 * The run that blocked an insert of a queued run: the scope's queued run or,
 * when it has started since, the scope's running run other than the one
 * already running before the insert. Null when the blocker has finished.
 */
export async function findBlockingRunId(
  scopeId: string,
  runningBefore: string | null,
): Promise<string | null> {
  // ASSUMPTION(oferty-pracy-0mq.19/ASM-1): the running run already running
  // before the insert is excluded; without it any running run would do.
  const result = await db().query<{ id: string }>(
    `SELECT id FROM source_sync_runs WHERE scope_id=$1
      AND (status='queued' OR (status='running' AND id IS DISTINCT FROM $2::uuid))
    ORDER BY status='queued' DESC LIMIT 1`,
    [scopeId, runningBefore],
  )
  return result.rows[0]?.id ?? null
}

export async function setRunJob(runId: string, jobId: string): Promise<void> {
  await db().query('UPDATE source_sync_runs SET job_id=$2 WHERE id=$1', [
    runId,
    jobId,
  ])
}

/**
 * Moves a queued run to running under the attempt, or hands a running run of
 * the same queue job over to a later attempt of that job. Null when neither
 * applies: a redelivered attempt or a finished run.
 */
export async function markRunStarted(
  runId: string,
  claim: { jobId: string | null; attempt: number },
): Promise<SyncRun | null> {
  const result = await db().query<RunRow>(
    `WITH started AS (
      UPDATE source_sync_runs SET status='running', attempt=$3,
        started_at=CASE WHEN status='queued' THEN now() ELSE started_at END
      WHERE id=$1 AND (status='queued' OR (status='running'
        AND $2::uuid IS NOT NULL AND job_id=$2::uuid AND coalesce(attempt,-1) < $3))
      RETURNING *
    ) SELECT ${runColumns} FROM started r JOIN source_scopes s ON s.id=r.scope_id`,
    [runId, claim.jobId, claim.attempt],
  )
  return result.rows[0] ? toRun(result.rows[0]) : null
}

/**
 * Locks the run until the end of the transaction when the attempt still
 * holds it, that is the run is running under that attempt, and returns it.
 * Null otherwise.
 */
export async function lockHeldRun(
  runId: string,
  attempt: number,
): Promise<SyncRun | null> {
  const result = await db().query<RunRow>(
    `WITH held AS (
      SELECT * FROM source_sync_runs WHERE id=$1 AND status='running' AND attempt=$2
      FOR UPDATE
    ) SELECT ${runColumns} FROM held r JOIN source_scopes s ON s.id=r.scope_id`,
    [runId, attempt],
  )
  return result.rows[0] ? toRun(result.rows[0]) : null
}

/**
 * Finishes a queued or running run; given an attempt, only a run running
 * under that attempt. False when nothing changed.
 */
export async function markRunFinished(
  runId: string,
  outcome: {
    status: FinishedRunStatus
    error: string | null
    diagnostics: unknown
  },
  attempt?: number,
): Promise<boolean> {
  const result = await db().query(
    `UPDATE source_sync_runs SET status=$2, error=$3, diagnostics=$4, finished_at=now()
    WHERE id=$1 AND CASE WHEN $5::int IS NULL THEN status IN ('queued','running')
      ELSE status='running' AND attempt=$5::int END`,
    [
      runId,
      outcome.status,
      outcome.error,
      outcome.diagnostics === undefined || outcome.diagnostics === null
        ? null
        : JSON.stringify(outcome.diagnostics),
      attempt ?? null,
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
  job_id: string | null
  attempt: number | null
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

/**
 * Inside a transaction: waits for, then holds until the transaction ends,
 * the lock on starting runs of the source.
 *
 * ASSUMPTION(oferty-pracy-0mq.16/ASM-3): exists only for the start in the
 * source's turn.
 */
export async function lockSourceTurn(source: string): Promise<void> {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `source-sync-turn:${source}`,
  ])
}

/**
 * The other runs of the run's source that may hold its turn: those running
 * and those queued before it, with their queue jobs.
 *
 * ASSUMPTION(oferty-pracy-0mq.16/ASM-3): exists only for the start in the
 * source's turn.
 */
export async function findRunsAhead(
  runId: string,
): Promise<{ id: string; jobId: string | null }[]> {
  const result = await db().query<{ id: string; job_id: string | null }>(
    `SELECT o.id, o.job_id FROM source_sync_runs r
      JOIN source_scopes s ON s.id=r.scope_id
      JOIN source_scopes os ON os.source=s.source
      JOIN source_sync_runs o ON o.scope_id=os.id
    WHERE r.id=$1 AND o.id<>r.id AND (o.status='running'
      OR (o.status='queued' AND (o.created_at, o.id) < (r.created_at, r.id)))`,
    [runId],
  )
  return result.rows.map((row) => ({ id: row.id, jobId: row.job_id }))
}
