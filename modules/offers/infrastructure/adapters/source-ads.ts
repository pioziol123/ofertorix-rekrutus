import { db } from '../../../../lib/db.ts'

// Reads ads and their revisions straight from the Sources tables, as before
// the module was gathered. Task 0mq.6 replaces these queries with the
// Sources read contract.

/** Rows of every ad with its current content, at most `limit` of them. */
export async function findCurrentAds(
  limit: number,
): Promise<Record<string, unknown>[]> {
  const result = await db().query(
    `SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id LIMIT $1`,
    [limit],
  )
  return result.rows
}

/** The row of one ad with its current content, or null. */
export async function findCurrentAd(
  id: string,
): Promise<Record<string, unknown> | null> {
  const result = await db().query(
    `SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id WHERE a.id=$1`,
    [id],
  )
  return result.rows[0] ?? null
}

/** Ids and retrieval times of the ad's revisions, newest first. */
export async function findRevisions(
  id: string,
): Promise<{ id: string; at: string }[]> {
  const result = await db().query(
    `SELECT id,retrieved_at AS at FROM source_ad_revisions WHERE source_ad_id=$1 ORDER BY retrieved_at DESC,id DESC`,
    [id],
  )
  return result.rows
}
