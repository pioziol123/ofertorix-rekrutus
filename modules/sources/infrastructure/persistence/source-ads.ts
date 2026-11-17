import { randomUUID } from 'node:crypto'
import { db } from '../../../../lib/db.ts'

/**
 * Source ads with their observations and content revisions. Internal to the
 * Sources module; the batch save, the run executor and the ad read are its
 * clients.
 */

export type ObservedAd = {
  source: string
  externalId: string
  url: string | null
  validTo: Date | null
  scopeId: string
}

/**
 * Inserts or updates the ad identified by source and external id as observed
 * now in the scope: available, with the observed URL and expiry. Returns the
 * ad id and the content hash of its current revision, read after the row
 * lock, so a concurrent save of the same ad sees the other's revision.
 */
export async function upsertObservedAd(
  ad: ObservedAd,
): Promise<{ id: string; currentContentHash: string | null }> {
  const result = await db().query<{ id: string; content_hash: string | null }>(
    `WITH upsert AS (
      INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id,valid_to)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT(source,external_id) DO UPDATE SET url=EXCLUDED.url,last_seen_at=now(),
        last_seen_scope_id=EXCLUDED.last_seen_scope_id,availability='available',valid_to=EXCLUDED.valid_to
      RETURNING id,current_revision_id
    ) SELECT upsert.id,r.content_hash FROM upsert LEFT JOIN source_ad_revisions r ON r.id=upsert.current_revision_id`,
    [randomUUID(), ad.source, ad.externalId, ad.url, ad.scopeId, ad.validTo],
  )
  const row = result.rows[0]!
  return { id: row.id, currentContentHash: row.content_hash }
}

/** Records that the run saw the ad; false when it had already seen it. */
export async function insertObservation(
  runId: string,
  adId: string,
): Promise<boolean> {
  const result = await db().query(
    `INSERT INTO source_run_seen(run_id,source_ad_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [runId, adId],
  )
  return result.rowCount === 1
}

/** Adds a content revision and makes it the ad's current one. */
export async function addCurrentRevision(
  adId: string,
  contentHash: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const revisionId = randomUUID()
  await db().query(
    `INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES ($1,$2,$3,$4)`,
    [revisionId, adId, contentHash, payload],
  )
  await db().query('UPDATE source_ads SET current_revision_id=$2 WHERE id=$1', [
    adId,
    revisionId,
  ])
}

/**
 * Marks the source's ads observed in any run of the scope, but not in the
 * given run, as unavailable. Ads already unavailable are left untouched.
 */
export async function markAdsAbsentFromRunUnavailable(run: {
  runId: string
  scopeId: string
  source: string
}): Promise<void> {
  await db().query(
    `UPDATE source_ads a SET availability='unavailable'
    WHERE a.source=$1 AND a.availability='available'
    AND a.id IN (
      SELECT s.source_ad_id FROM source_run_seen s
      JOIN source_sync_runs r ON r.id=s.run_id WHERE r.scope_id=$2
    )
    AND NOT EXISTS (SELECT 1 FROM source_run_seen s WHERE s.run_id=$3 AND s.source_ad_id=a.id)`,
    [run.source, run.scopeId, run.runId],
  )
}

// Reads for the public ad read. They take no row locks, so a reader never
// delays a sync that changes the ad.

/** An ad row with the content of one of its versions. */
export type AdContentRow = {
  id: string
  source: string
  url: string | null
  first_seen_at: Date
  last_seen_at: Date
  valid_to: Date | null
  availability: string
  version_id: string
  payload: unknown
}

const adContentColumns = `a.id,a.source,a.url,a.first_seen_at,a.last_seen_at,a.valid_to,a.availability,r.id AS version_id,r.payload`

/**
 * Ads with their current content: the given ids, or every ad when `ids` is
 * null, at most `limit` rows. Unknown ids are skipped.
 */
export async function findCurrentAds(
  ids: readonly string[] | null,
  limit: number,
): Promise<AdContentRow[]> {
  const result =
    ids === null
      ? await db().query<AdContentRow>(
          `SELECT ${adContentColumns} FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id LIMIT $1`,
          [limit],
        )
      : await db().query<AdContentRow>(
          `SELECT ${adContentColumns} FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id WHERE a.id=ANY($1::uuid[]) LIMIT $2`,
          [ids, limit],
        )
  return result.rows
}

/** The given versions with their ads; unknown version ids are skipped. */
export async function findAdVersions(
  versionIds: readonly string[],
): Promise<AdContentRow[]> {
  const result = await db().query<AdContentRow>(
    `SELECT ${adContentColumns} FROM source_ad_revisions r JOIN source_ads a ON a.id=r.source_ad_id WHERE r.id=ANY($1::uuid[])`,
    [versionIds],
  )
  return result.rows
}

/** Ids and retrieval times of the ad's versions, newest first. */
export async function findVersionList(
  adId: string,
): Promise<{ id: string; at: Date }[]> {
  const result = await db().query<{ id: string; at: Date }>(
    `SELECT id,retrieved_at AS at FROM source_ad_revisions WHERE source_ad_id=$1 ORDER BY retrieved_at DESC,id DESC`,
    [adId],
  )
  return result.rows
}

/** The current version of each given ad that has one. */
export async function findCurrentVersions(
  adIds: readonly string[],
): Promise<{ ad_id: string; version_id: string }[]> {
  const result = await db().query<{ ad_id: string; version_id: string }>(
    `SELECT id AS ad_id,current_revision_id AS version_id FROM source_ads WHERE id=ANY($1::uuid[]) AND current_revision_id IS NOT NULL`,
    [adIds],
  )
  return result.rows
}
