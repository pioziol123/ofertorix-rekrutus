import type { Pool } from 'pg'
import type { QueryExecutor } from '../db.ts'
import type { OfferView } from '../../modules/offers/index.ts'
import { chargeCeiling } from '../ai/budget.ts'
import { matchingConfiguration } from './store.ts'
import { activeProfileVersion, currentAdVersions } from './ratings.ts'
import {
  matchingGroupLabels,
  matchingPending,
  type MatchingSummary,
} from './view.ts'
/**
 * Adds to each offer the summary of its match assessment. Reads in bulk, a
 * fixed number of queries for any number of offers: the active profile
 * version, the current ad versions from the Sources read and the
 * assessments.
 */
export async function decorateMatching(
  pool: QueryExecutor,
  offers: OfferView[],
): Promise<OfferView[]> {
  if (!offers.length) return []
  const activeId = (await activeProfileVersion())?.id ?? null
  const ids = offers.map((o) => o.id)
  const current = await currentAdVersions(ids)
  const result = await pool.query(
    `SELECT a.id,l.id AS request_id,l.state,s.id AS score_id,s.calculation,s.assessment_author,s.profile_version_id,s.ad_revision_id
    FROM unnest($1::uuid[]) AS a(id)
    LEFT JOIN LATERAL (SELECT id,state FROM matching_requests WHERE ad_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) l ON true
    LEFT JOIN matching_rating_heads rh ON rh.ad_id=a.id
    LEFT JOIN matching_rating_revisions s ON s.id=rh.revision_id`,
    [ids],
  )
  // Ads the Sources read no longer knows get no summary, as before.
  const byId = new Map(
    result.rows
      .filter((row) => current.has(row.id))
      .map((row) => [row.id, row]),
  )
  const percent = (value: unknown) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
      ? value
      : null
  return offers.map((offer) => {
    const row = byId.get(offer.id)
    if (!row?.request_id && !row?.score_id) return offer
    const calculation = row.calculation
    const parts = Array.isArray(calculation?.components)
      ? calculation.components
      : []
    const components = Object.fromEntries(
      Object.keys(matchingGroupLabels).map((key) => [
        key,
        percent(parts.find((c: { group: string }) => c.group === key)?.score),
      ]),
    ) as MatchingSummary['components']
    return {
      ...offer,
      assessment: {
        requestId: row.request_id ?? null,
        state: row.state ?? 'completed',
        author: row.assessment_author ?? undefined,
        scoreId: row.score_id ?? null,
        rating: percent(calculation?.rating),
        completeness: percent(calculation?.completeness),
        stale:
          !!row.score_id &&
          (row.profile_version_id !== activeId ||
            row.ad_revision_id !== current.get(row.id)),
        components,
      },
    }
  })
}
export async function matchingListStatus(pool: Pool) {
  const config = matchingConfiguration()
  const profile = await activeProfileVersion()
  const state = (
    await pool.query(
      'SELECT count(*)::int AS pending FROM matching_requests WHERE state=ANY($1::text[])',
      [matchingPending],
    )
  ).rows[0]
  return {
    configured: config !== null,
    profileReady: profile !== null,
    pending: Number(state?.pending ?? 0),
    maximumCostPln: config
      ? chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens)
      : null,
  }
}
