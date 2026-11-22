import { db } from '../../../../lib/db.ts'
import { shownRequest } from './assessment-requests.ts'
import type {
  Assessment,
  calculate,
  MatchingInput,
} from '../../domain/assessment.ts'
import { weightsSchema, type Weights } from '../../domain/weights.ts'

/** Ratings and weights change one at a time, for the transaction. */
export async function lockRatings() {
  await db().query(
    "SELECT pg_advisory_xact_lock(hashtext('matching-rating-global'))",
  )
}

export type WeightVersion = {
  id: string
  number: string
  weights: Weights
  created_at: Date
}

/** The weights in force. */
export async function activeWeights(): Promise<WeightVersion> {
  const row = (
    await db().query<WeightVersion>(
      'SELECT v.id,v.number,v.weights,v.created_at FROM matching_weight_head h JOIN matching_weight_versions v ON v.id=h.version_id WHERE singleton',
    )
  ).rows[0]
  if (!row) throw new Error('Missing weights')
  return { ...row, weights: weightsSchema.parse(row.weights) }
}

/** Every weight version, newest first, each marked whether it is in force. */
export async function weightVersions() {
  return (
    await db().query<WeightVersion & { current: boolean }>(
      'SELECT v.id,v.number,v.weights,v.created_at,(v.id=h.version_id) AS current FROM matching_weight_versions v CROSS JOIN matching_weight_head h ORDER BY v.number DESC',
    )
  ).rows
}

/** The weight version a weight command saved, with the command's hash. */
export async function findWeightCommand(
  commandId: string,
): Promise<{ id: string; command_hash: string } | null> {
  return (
    (
      await db().query(
        'SELECT version_id AS id,command_hash FROM matching_weight_commands WHERE command_id=$1',
        [commandId],
      )
    ).rows[0] ?? null
  )
}

export async function insertWeightCommand(
  commandId: string,
  hash: string,
  versionId: string,
) {
  await db().query(
    'INSERT INTO matching_weight_commands(command_id,command_hash,version_id) VALUES($1,$2,$3)',
    [commandId, hash, versionId],
  )
}

/** Saves a weight version and puts it in force. */
export async function insertWeightVersion(version: {
  id: string
  weights: Weights
  previousId: string
  commandId: string
  hash: string
}) {
  await db().query(
    'INSERT INTO matching_weight_versions(id,weights,previous_id,command_id,command_hash) VALUES($1,$2,$3,$4,$5)',
    [
      version.id,
      version.weights,
      version.previousId,
      version.commandId,
      version.hash,
    ],
  )
  await db().query(
    'UPDATE matching_weight_head SET version_id=$1 WHERE singleton',
    [version.id],
  )
}

/** A stored rating revision. */
export type StoredRating = {
  id: string
  ad_id: string
  profile_version_id: string
  ad_revision_id: string
  input: MatchingInput
  result: Assessment
  assessment_author: 'ai' | 'owner'
}

export type RevisionRecord = {
  id: string
  adId: string
  profileVersionId: string
  adRevisionId: string
  input: MatchingInput
  result: Assessment
  calculation: ReturnType<typeof calculate>
  weightsVersionId: string
  author: 'ai' | 'owner' | 'system'
  assessmentAuthor: 'ai' | 'owner'
  reason: string
  previousId: string | null
  basisId: string | null
  requestId: string | null
  commandId: string | null
  commandHash: string | null
}

/** Saves a rating revision and, when promoted, makes it the ad's current one. */
export async function insertRevision(
  revision: RevisionRecord,
  promote: boolean,
) {
  await db().query(
    `INSERT INTO matching_rating_revisions(id,ad_id,request_id,profile_version_id,ad_revision_id,input,result,calculation,weights_version_id,author,assessment_author,reason,previous_revision_id,basis_revision_id,command_id,command_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      revision.id,
      revision.adId,
      revision.requestId,
      revision.profileVersionId,
      revision.adRevisionId,
      revision.input,
      revision.result,
      revision.calculation,
      revision.weightsVersionId,
      revision.author,
      revision.assessmentAuthor,
      revision.reason,
      revision.previousId,
      revision.basisId,
      revision.commandId,
      revision.commandHash,
    ],
  )
  if (promote)
    await db().query(
      'INSERT INTO matching_rating_heads(ad_id,revision_id) VALUES($1,$2) ON CONFLICT(ad_id) DO UPDATE SET revision_id=excluded.revision_id',
      [revision.adId, revision.id],
    )
}

/** The ad's current rating revision, or null. */
export async function ratingHead(adId: string): Promise<StoredRating | null> {
  return (
    (
      await db().query<StoredRating>(
        'SELECT r.* FROM matching_rating_heads h JOIN matching_rating_revisions r ON r.id=h.revision_id WHERE h.ad_id=$1',
        [adId],
      )
    ).rows[0] ?? null
  )
}

/** The current rating revision of every ad, by ad. */
export async function ratingHeads(): Promise<StoredRating[]> {
  return (
    await db().query<StoredRating>(
      'SELECT r.* FROM matching_rating_heads h JOIN matching_rating_revisions r ON r.id=h.revision_id ORDER BY h.ad_id',
    )
  ).rows
}

/** The revision that published an assessment request, or null. */
export async function revisionOfRequest(
  requestId: string,
): Promise<{ id: string; calculation: ReturnType<typeof calculate> } | null> {
  return (
    (
      await db().query(
        'SELECT id,calculation FROM matching_rating_revisions WHERE request_id=$1',
        [requestId],
      )
    ).rows[0] ?? null
  )
}

/** The revision an owner's command saved, with the command's hash, or null. */
export async function revisionOfCommand(
  commandId: string,
): Promise<{ id: string; command_hash: string } | null> {
  return (
    (
      await db().query(
        'SELECT id,command_hash FROM matching_rating_revisions WHERE command_id=$1',
        [commandId],
      )
    ).rows[0] ?? null
  )
}

/** A rating revision of the history, with its weights. */
export type RatingHistoryRow = {
  id: string
  request_id: string | null
  result: Assessment
  calculation: ReturnType<typeof calculate>
  author: 'ai' | 'owner' | 'system'
  assessment_author: 'ai' | 'owner'
  reason: string
  profile_version_id: string
  ad_revision_id: string
  weights_version_id: string
  weights_number: string
  weights: Weights
  created_at: Date
  criteria: MatchingInput['criteria']
  checks: MatchingInput['checks']
  is_current: boolean
}

/** Every rating revision of an ad, newest first. */
export async function ratingHistory(adId: string): Promise<RatingHistoryRow[]> {
  return (
    await db().query<RatingHistoryRow>(
      `SELECT r.id,r.request_id,r.result,r.calculation,r.author,r.assessment_author,r.reason,r.profile_version_id,r.ad_revision_id,
    r.weights_version_id,w.number AS weights_number,w.weights,r.created_at,r.input->'criteria' AS criteria,r.input->'checks' AS checks,(h.revision_id=r.id) AS is_current
    FROM matching_rating_revisions r JOIN matching_weight_versions w ON w.id=r.weights_version_id
    LEFT JOIN matching_rating_heads h ON h.ad_id=r.ad_id WHERE r.ad_id=$1 ORDER BY r.sequence DESC`,
      [adId],
    )
  ).rows
}

/**
 * The latest request the history shows and the current rating of each
 * given ad, in one query; `failedMessage` is the message of a failed
 * assignment (see `shownRequest`). An ad without either comes back with
 * nulls.
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-1)
 */
export async function latestOfAds(
  ids: readonly string[],
  failedMessage: string,
) {
  return (
    await db().query(
      `SELECT a.id,l.id AS request_id,l.state,l.assessed,l.failed,s.id AS score_id,s.calculation,s.assessment_author,s.profile_version_id,s.ad_revision_id
    FROM unnest($1::uuid[]) AS a(id)
    LEFT JOIN LATERAL (SELECT id,state,(result IS NOT NULL) AS assessed,(result IS NULL AND error IS NOT NULL) AS failed FROM matching_requests r WHERE r.ad_id=a.id AND ${shownRequest('r', '$2')} ORDER BY r.created_at DESC,r.id DESC LIMIT 1) l ON true
    LEFT JOIN matching_rating_heads rh ON rh.ad_id=a.id
    LEFT JOIN matching_rating_revisions s ON s.id=rh.revision_id`,
      [ids, failedMessage],
    )
  ).rows
}
