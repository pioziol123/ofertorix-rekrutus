import { db } from '../../../../lib/db.ts'
import type { SyncState, SyncTrigger } from '../../domain/sync-history.ts'

/**
 * The sync history's queries (T1): runs of every scope, filtered and paged,
 * with their new ads counted at read time (PS-D01). Nothing is stored.
 */

export type HistoryFilter = {
  /** Empty: every source. */
  sources: string[]
  /** Empty: every status. */
  states: SyncState[]
  trigger: SyncTrigger | null
  /** Runs requested at or after this moment; null: no lower bound. */
  requestedFrom: Date | null
}

export type HistoryRow = {
  id: string
  source: string
  trigger: SyncTrigger
  status: SyncState
  created_at: Date
  seen: number
  revisions: number
  /** Null while the run is unfinished. */
  new_ads: number | null
}

export type DetailsRow = HistoryRow & {
  started_at: Date | null
  finished_at: Date | null
  pages: number
  error: string | null
  diagnostics: unknown
}

/*
 * New ads of a finished run: the ads it saw whose first-seen time lies
 * between its start and its finish (PS-D01). A source has one unfinished
 * run at a time, so this is "no earlier run of the source saw it". A run
 * that never started has no start and counts none.
 */
const columns = `r.id, s.source, r.trigger, r.status, r.created_at, r.seen,
  r.revisions,
  CASE WHEN r.status IN ('complete','partial','failed') THEN (
    SELECT count(*)::int FROM source_run_seen o
    JOIN source_ads a ON a.id=o.source_ad_id
    WHERE o.run_id=r.id
      AND a.first_seen_at >= r.started_at AND a.first_seen_at <= r.finished_at
  ) END AS new_ads`

const where = `($1::text[] IS NULL OR s.source = ANY($1::text[]))
  AND ($2::text[] IS NULL OR r.status = ANY($2::text[]))
  AND ($3::text IS NULL OR r.trigger = $3)
  AND ($4::timestamptz IS NULL OR r.created_at >= $4)`

const parameters = (filter: HistoryFilter) => [
  filter.sources.length ? filter.sources : null,
  filter.states.length ? filter.states : null,
  filter.trigger,
  filter.requestedFrom,
]

/** The number of runs matching the filter. */
export async function countHistory(filter: HistoryFilter): Promise<number> {
  const result = await db().query<{ total: number }>(
    `SELECT count(*)::int AS total FROM source_sync_runs r
    JOIN source_scopes s ON s.id=r.scope_id WHERE ${where}`,
    parameters(filter),
  )
  return result.rows[0]!.total
}

/** One page of matching runs, latest requested first, then by id. */
export async function findHistoryPage(
  filter: HistoryFilter,
  page: { limit: number; offset: number },
): Promise<HistoryRow[]> {
  const result = await db().query<HistoryRow>(
    `SELECT ${columns} FROM source_sync_runs r
    JOIN source_scopes s ON s.id=r.scope_id WHERE ${where}
    ORDER BY r.created_at DESC, r.id DESC LIMIT $5 OFFSET $6`,
    [...parameters(filter), page.limit, page.offset],
  )
  return result.rows
}

/** One run with its course, error and diagnostics; null when unknown. */
export async function findRunDetails(
  runId: string,
): Promise<DetailsRow | null> {
  const result = await db().query<DetailsRow>(
    `SELECT ${columns}, r.started_at, r.finished_at, r.pages, r.error,
      r.diagnostics
    FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE r.id=$1`,
    [runId],
  )
  return result.rows[0] ?? null
}
