import { db } from '../../../../lib/db.ts'
import {
  finishedRunStatuses,
  type FinishedRunStatus,
} from '../../domain/run-states.ts'
import { failedInRow } from '../../domain/source-health.ts'
import { finishedRunNewAds } from './sync-history.ts'

/**
 * The health read's queries (T4): computed from the stored runs of every
 * scope of a source at each read; nothing is stored (T4 approach, item 2).
 */

/** Unfinished runs of the sources (T4-R01). */
export async function countUnfinishedRuns(
  sources: readonly string[],
): Promise<number> {
  const result = await db().query<{ total: number }>(
    `SELECT count(*)::int AS total FROM source_sync_runs r
    JOIN source_scopes s ON s.id=r.scope_id
    WHERE r.status IN ('queued','running') AND s.source = ANY($1::text[])`,
    [sources],
  )
  return result.rows[0]!.total
}

/** New ads of the sources' runs finished at or after `from` (T4-R03). */
export async function sumNewAdsFinishedSince(
  sources: readonly string[],
  from: Date,
): Promise<number> {
  const result = await db().query<{ total: number }>(
    `SELECT coalesce(sum(${finishedRunNewAds}), 0)::int AS total
    FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
    WHERE r.status = ANY($3::text[]) AND r.finished_at >= $2
      AND s.source = ANY($1::text[])`,
    [sources, from, finishedRunStatuses],
  )
  return result.rows[0]!.total
}

export type SourceRunsRow = {
  source: string
  latest_complete_at: Date | null
  /** Latest first, by finish time then id, at most `failedInRow`. */
  latest_finished: FinishedRunStatus[]
}

/**
 * Per source, across all its scopes, the finish of its latest complete
 * run and the statuses of its latest finished runs (T4-R02, R04, R05).
 * Each source reads a few latest runs only.
 */
export async function findSourceRuns(
  sources: readonly string[],
): Promise<SourceRunsRow[]> {
  const result = await db().query<SourceRunsRow>(
    `SELECT src.source,
      (SELECT max(r.finished_at) FROM source_sync_runs r
        JOIN source_scopes s ON s.id=r.scope_id
        WHERE s.source=src.source AND r.status='complete'
      ) AS latest_complete_at,
      ARRAY(SELECT r.status FROM source_sync_runs r
        JOIN source_scopes s ON s.id=r.scope_id
        WHERE s.source=src.source AND r.status = ANY($2::text[])
        ORDER BY r.finished_at DESC NULLS LAST, r.id DESC LIMIT $3
      ) AS latest_finished
    FROM unnest($1::text[]) AS src(source)`,
    [sources, finishedRunStatuses, failedInRow],
  )
  return result.rows
}
