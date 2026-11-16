import { randomUUID } from 'node:crypto'
import { db } from '../../../../lib/db.ts'

/**
 * Source ads with their observations and content revisions. Internal to the
 * Sources module; the batch save and the run executor are its clients.
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
 * Marks the source's ads last seen in the scope, but not observed in the
 * run, as unavailable: the rule SOLID.Jobs applied before connectors.
 */
export async function markUnobservedScopeAdsUnavailable(run: {
  id: string
  scopeId: string
  source: string
}): Promise<void> {
  await db().query(
    `UPDATE source_ads a SET availability='unavailable'
    WHERE source=$1 AND last_seen_scope_id=$2
    AND NOT EXISTS (SELECT 1 FROM source_run_seen s WHERE s.run_id=$3 AND s.source_ad_id=a.id)`,
    [run.source, run.scopeId, run.id],
  )
}
