import type { Pool } from 'pg'
import type { OfferView } from '../offers.ts'
import { chargeCeiling } from '../ai/budget.ts'
import { matchingConfiguration } from './store.ts'
import { activeProfileVersion } from './profile-versions.ts'
import {
  matchingGroupLabels,
  matchingPending,
  type MatchingSummary,
} from './view.ts'
export async function decorateMatching(
  pool: Pool,
  offers: OfferView[],
): Promise<OfferView[]> {
  if (!offers.length) return []
  const activeId = (await activeProfileVersion())?.id ?? null
  const result = await pool.query(
    `SELECT a.id,l.id AS request_id,l.state,s.id AS score_id,s.calculation,s.assessment_author,
    (s.profile_version_id IS DISTINCT FROM $2::uuid OR s.ad_revision_id IS DISTINCT FROM a.current_revision_id) AS stale
    FROM source_ads a
    LEFT JOIN LATERAL (SELECT id,state FROM matching_requests WHERE ad_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) l ON true
    LEFT JOIN matching_rating_heads rh ON rh.ad_id=a.id
    LEFT JOIN matching_rating_revisions s ON s.id=rh.revision_id
    WHERE a.id=ANY($1::uuid[])`,
    [offers.map((o) => o.id), activeId],
  )
  const byId = new Map(result.rows.map((row) => [row.id, row]))
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
        stale: !!row.score_id && row.stale === true,
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
