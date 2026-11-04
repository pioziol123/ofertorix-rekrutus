import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { hash, type Offer } from './solid.ts'

export async function transaction<T>(
  client: PoolClient,
  action: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await action()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export async function saveOffers(
  client: PoolClient,
  run: { id: string; scope_id: string },
  jobs: Offer[],
  sourceName: string,
): Promise<boolean> {
  return transaction(client, async () => {
    let duplicate = false
    let seen = 0
    let revisions = 0
    for (const offer of jobs) {
      const url = typeof offer.url === 'string' ? offer.url : null
      const validTo =
        typeof offer.validTo === 'string' &&
        Number.isFinite(Date.parse(offer.validTo))
          ? new Date(offer.validTo)
          : null
      const ad = await client.query<{
        id: string
        content_hash: string | null
      }>(
        `
        WITH upsert AS (
          INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id,valid_to)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT(source,external_id) DO UPDATE SET url=EXCLUDED.url,last_seen_at=now(),
            last_seen_scope_id=EXCLUDED.last_seen_scope_id,availability='available',valid_to=EXCLUDED.valid_to
          RETURNING id,current_revision_id
        ) SELECT upsert.id,r.content_hash FROM upsert LEFT JOIN source_ad_revisions r ON r.id=upsert.current_revision_id`,
        [
          randomUUID(),
          sourceName,
          offer.jobOfferKey,
          url,
          run.scope_id,
          validTo,
        ],
      )
      const current = ad.rows[0]!
      const observation = await client.query(
        `INSERT INTO source_run_seen(run_id,source_ad_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [run.id, current.id],
      )
      if (!observation.rowCount) duplicate = true
      else seen++
      const contentHash = hash(offer)
      if (contentHash !== current.content_hash) {
        const revisionId = randomUUID()
        await client.query(
          `INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES ($1,$2,$3,$4)`,
          [revisionId, current.id, contentHash, offer],
        )
        await client.query(
          'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
          [current.id, revisionId],
        )
        revisions++
      }
    }
    await client.query(
      'UPDATE source_sync_runs SET pages=pages+1,seen=seen+$2,revisions=revisions+$3 WHERE id=$1',
      [run.id, seen, revisions],
    )
    return duplicate
  })
}
