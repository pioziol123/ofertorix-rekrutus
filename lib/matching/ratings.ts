import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { tx } from '../profile/store.ts'
import { profileSchema } from '../profile/model.ts'
import { projectOffer } from '../offers.ts'
import {
  assessmentSchema,
  calculate,
  matchingInput,
  validateAssessment,
  type Assessment,
  type MatchingInput,
} from './model.ts'
import { weightsSchema, type Weights } from './weights.ts'
const uuid = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase())
export class RatingConflict extends Error {}
export const manualRatingCommand = z
  .object({
    commandId: uuid,
    expectedRevisionId: uuid.nullable(),
    profileVersionId: uuid,
    adRevisionId: uuid,
    assessment: assessmentSchema,
    reason: z.string().trim().min(1).max(3000),
  })
  .strict()
export const weightCommand = z
  .object({ commandId: uuid, expectedVersionId: uuid, weights: weightsSchema })
  .strict()
const fingerprint = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex')
async function lock(client: PoolClient) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('matching-rating-global'))",
  )
}
type WeightVersion = {
  id: string
  number: string
  weights: Weights
  created_at: Date
}
async function activeWeights(client: PoolClient) {
  const row = (
    await client.query<WeightVersion>(
      'SELECT v.id,v.number,v.weights,v.created_at FROM matching_weight_head h JOIN matching_weight_versions v ON v.id=h.version_id WHERE singleton',
    )
  ).rows[0]
  if (!row) throw new Error('Missing weights')
  return { ...row, weights: weightsSchema.parse(row.weights) }
}
export async function readWeights(pool: Pool) {
  const rows = (
    await pool.query<WeightVersion>(
      'SELECT v.id,v.number,v.weights,v.created_at,(v.id=h.version_id) AS current FROM matching_weight_versions v CROSS JOIN matching_weight_head h ORDER BY v.number DESC',
    )
  ).rows
  const current = rows.find(
    (row) => (row as WeightVersion & { current: boolean }).current,
  )
  if (!current) throw new Error('Missing weights')
  return { current, history: rows }
}
type StoredRating = {
  id: string
  ad_id: string
  profile_version_id: string
  ad_revision_id: string
  input: MatchingInput
  result: Assessment
  assessment_author: 'ai' | 'owner'
}
async function insertRevision(
  client: PoolClient,
  value: {
    adId: string
    profileVersionId: string
    adRevisionId: string
    input: MatchingInput
    result: Assessment
    author: 'ai' | 'owner' | 'system'
    assessmentAuthor: 'ai' | 'owner'
    reason: string
    previousId: string | null
    basisId?: string | null
    requestId?: string | null
    commandId?: string
    commandHash?: string
  },
  weights: WeightVersion,
  promote = true,
) {
  const id = randomUUID(),
    calculation = calculate(value.result, value.input, weights.weights)
  await client.query(
    `INSERT INTO matching_rating_revisions(id,ad_id,request_id,profile_version_id,ad_revision_id,input,result,calculation,weights_version_id,author,assessment_author,reason,previous_revision_id,basis_revision_id,command_id,command_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      value.adId,
      value.requestId ?? null,
      value.profileVersionId,
      value.adRevisionId,
      value.input,
      value.result,
      calculation,
      weights.id,
      value.author,
      value.assessmentAuthor,
      value.reason,
      value.previousId,
      value.basisId ?? null,
      value.commandId ?? null,
      value.commandHash ?? null,
    ],
  )
  if (promote)
    await client.query(
      'INSERT INTO matching_rating_heads(ad_id,revision_id) VALUES($1,$2) ON CONFLICT(ad_id) DO UPDATE SET revision_id=excluded.revision_id',
      [value.adId, id],
    )
  return { id, calculation }
}
async function versions(client: PoolClient, adId: string) {
  const row = (
    await client.query(
      'SELECT a.current_revision_id,h.active_version_id FROM source_ads a CROSS JOIN profile_head h WHERE a.id=$1 FOR SHARE OF a,h',
      [adId],
    )
  ).rows[0]
  if (!row) throw new RatingConflict('Nie znaleziono oferty.')
  return row as {
    current_revision_id: string
    active_version_id: string | null
  }
}
async function head(client: PoolClient, adId: string) {
  return (
    (
      await client.query<StoredRating>(
        'SELECT r.* FROM matching_rating_heads h JOIN matching_rating_revisions r ON r.id=h.revision_id WHERE h.ad_id=$1',
        [adId],
      )
    ).rows[0] ?? null
  )
}
// The caller owns the transaction: AI cost, request result and rating publish commit together.
export async function publishAiRating(
  client: PoolClient,
  request: {
    id: string
    ad_id: string
    profile_version_id: string
    ad_revision_id: string
    input: MatchingInput
  },
  result: Assessment,
) {
  await lock(client)
  const existing = (
    await client.query(
      'SELECT id,calculation FROM matching_rating_revisions WHERE request_id=$1',
      [request.id],
    )
  ).rows[0]
  if (existing)
    return existing as { id: string; calculation: ReturnType<typeof calculate> }
  const weights = await activeWeights(client),
    previous = await head(client, request.ad_id),
    current = await versions(client, request.ad_id)
  const isFresh = (profile: string, ad: string) =>
    profile === current.active_version_id && ad === current.current_revision_id
  const promote =
    isFresh(request.profile_version_id, request.ad_revision_id) ||
    !previous ||
    !isFresh(previous.profile_version_id, previous.ad_revision_id)
  return insertRevision(
    client,
    {
      adId: request.ad_id,
      profileVersionId: request.profile_version_id,
      adRevisionId: request.ad_revision_id,
      input: request.input,
      result,
      author: 'ai',
      assessmentAuthor: 'ai',
      reason: 'Ocena AI',
      previousId: previous?.id ?? null,
      requestId: request.id,
    },
    weights,
    promote,
  )
}
export async function manualContext(pool: Pool, adId: string) {
  const profile = (
    await pool.query(
      'SELECT v.* FROM profile_head h JOIN profile_versions v ON v.id=h.active_version_id WHERE h.singleton',
    )
  ).rows[0]
  if (!profile) return null
  const ad = (
    await pool.query(
      'SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id WHERE a.id=$1',
      [adId],
    )
  ).rows[0]
  if (!ad) throw new RatingConflict('Nie znaleziono oferty.')
  const client = await pool.connect()
  try {
    const previous = await head(client, adId),
      input = matchingInput(profileSchema.parse(profile.data), projectOffer(ad))
    const same =
      previous?.profile_version_id === profile.id &&
      previous?.ad_revision_id === ad.current_revision_id
    const assessment: Assessment =
      same && previous
        ? previous.result
        : {
            summary: 'Własna ocena dopasowania.',
            strengths: [],
            gaps: [],
            criteria: input.criteria.map((c) => ({
              id: c.id,
              state: 'unknown',
              score: null,
              profileEvidence: null,
              offerEvidence: null,
              reason: 'Brak danych do oceny.',
            })),
          }
    return {
      headId: previous?.id ?? null,
      profileVersionId: String(profile.id),
      adRevisionId: String(ad.current_revision_id),
      input,
      assessment,
      staleBase: !!previous && !same,
    }
  } finally {
    client.release()
  }
}
export async function saveManualRating(
  pool: Pool,
  adId: string,
  value: unknown,
) {
  const command = manualRatingCommand.parse(value),
    hash = fingerprint({ adId: adId.toLowerCase(), ...command })
  const client = await pool.connect()
  try {
    return await tx(client, async () => {
      await lock(client)
      const duplicate = (
        await client.query(
          'SELECT id,command_hash FROM matching_rating_revisions WHERE command_id=$1',
          [command.commandId],
        )
      ).rows[0]
      if (duplicate) {
        if (duplicate.command_hash !== hash)
          throw new RatingConflict('Identyfikator zapisu dotyczy innej treści.')
        return { id: String(duplicate.id), reused: true }
      }
      const previous = await head(client, adId),
        current = await versions(client, adId)
      if (
        (previous?.id ?? null) !== command.expectedRevisionId ||
        current.active_version_id !== command.profileVersionId ||
        current.current_revision_id !== command.adRevisionId
      )
        throw new RatingConflict(
          'Ocena, profil lub ogłoszenie zmieniły się. Wczytaj aktualne dane przed zapisem; Twój formularz nie został zapisany.',
        )
      const context = await manualContextOnClient(
        client,
        adId,
        command.profileVersionId,
      )
      let result: Assessment
      try {
        result = validateAssessment(command.assessment, context, 'owner')
      } catch {
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['assessment'],
            message: 'Sprawdź kryteria, oceny i uzasadnienia.',
          },
        ])
      }
      const revision = await insertRevision(
        client,
        {
          adId,
          profileVersionId: command.profileVersionId,
          adRevisionId: command.adRevisionId,
          input: context,
          result,
          author: 'owner',
          assessmentAuthor: 'owner',
          reason: command.reason,
          previousId: previous?.id ?? null,
          basisId: previous?.id ?? null,
          commandId: command.commandId,
          commandHash: hash,
        },
        await activeWeights(client),
      )
      return { id: revision.id, reused: false }
    })
  } finally {
    client.release()
  }
}
async function manualContextOnClient(
  client: PoolClient,
  adId: string,
  profileVersionId: string,
) {
  const profile = (
    await client.query('SELECT data FROM profile_versions WHERE id=$1', [
      profileVersionId,
    ])
  ).rows[0]
  const ad = (
    await client.query(
      'SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id WHERE a.id=$1',
      [adId],
    )
  ).rows[0]
  return matchingInput(profileSchema.parse(profile.data), projectOffer(ad))
}
export async function saveWeights(pool: Pool, value: unknown) {
  const command = weightCommand.parse(value),
    hash = fingerprint(command)
  const client = await pool.connect()
  try {
    return await tx(client, async () => {
      await lock(client)
      const duplicate = (
        await client.query(
          'SELECT version_id AS id,command_hash FROM matching_weight_commands WHERE command_id=$1',
          [command.commandId],
        )
      ).rows[0]
      if (duplicate) {
        if (duplicate.command_hash !== hash)
          throw new RatingConflict('Identyfikator zapisu dotyczy innych wag.')
        return { versionId: String(duplicate.id), updated: 0, reused: true }
      }
      const previous = await activeWeights(client)
      if (previous.id !== command.expectedVersionId)
        throw new RatingConflict(
          'Wagi zmieniły się. Wczytaj aktualną wersję przed zapisem.',
        )
      if (
        JSON.stringify(previous.weights) === JSON.stringify(command.weights)
      ) {
        await client.query(
          'INSERT INTO matching_weight_commands(command_id,command_hash,version_id) VALUES($1,$2,$3)',
          [command.commandId, hash, previous.id],
        )
        return { versionId: previous.id, updated: 0, reused: false }
      }
      const id = randomUUID()
      await client.query(
        'INSERT INTO matching_weight_versions(id,weights,previous_id,command_id,command_hash) VALUES($1,$2,$3,$4,$5)',
        [id, command.weights, previous.id, command.commandId, hash],
      )
      await client.query(
        'UPDATE matching_weight_head SET version_id=$1 WHERE singleton',
        [id],
      )
      const weights = await activeWeights(client)
      const rows = (
        await client.query<StoredRating>(
          'SELECT r.* FROM matching_rating_heads h JOIN matching_rating_revisions r ON r.id=h.revision_id ORDER BY h.ad_id',
        )
      ).rows
      for (const row of rows)
        await insertRevision(
          client,
          {
            adId: row.ad_id,
            profileVersionId: row.profile_version_id,
            adRevisionId: row.ad_revision_id,
            input: row.input,
            result: row.result,
            author: 'system',
            assessmentAuthor: row.assessment_author,
            reason: 'Przeliczenie po zmianie wag',
            previousId: row.id,
            basisId: row.id,
          },
          weights,
        )
      await client.query(
        'INSERT INTO matching_weight_commands(command_id,command_hash,version_id) VALUES($1,$2,$3)',
        [command.commandId, hash, id],
      )
      return { versionId: id, updated: rows.length, reused: false }
    })
  } finally {
    client.release()
  }
}
export type RatingView = {
  id: string
  request_id: string | null
  result: Assessment
  calculation: ReturnType<typeof calculate>
  author: 'ai' | 'owner' | 'system'
  assessment_author: 'ai' | 'owner'
  reason: string
  profile_version_id: string
  ad_revision_id: string
  profile_number: number
  offer_version_at: Date
  weights_version_id: string
  weights_number: string
  weights: Weights
  created_at: Date
  criteria: MatchingInput['criteria']
  checks: MatchingInput['checks']
  is_current: boolean
  stale: boolean
}
export async function readRatings(pool: Pool, adId: string) {
  const rows = (
    await pool.query<RatingView>(
      `SELECT r.id,r.request_id,r.result,r.calculation,r.author,r.assessment_author,r.reason,r.profile_version_id,r.ad_revision_id,v.number AS profile_number,ar.retrieved_at AS offer_version_at,
    r.weights_version_id,w.number AS weights_number,w.weights,r.created_at,r.input->'criteria' AS criteria,r.input->'checks' AS checks,(h.revision_id=r.id) AS is_current,
    (r.profile_version_id IS DISTINCT FROM p.active_version_id OR r.ad_revision_id IS DISTINCT FROM a.current_revision_id) AS stale
    FROM matching_rating_revisions r JOIN source_ads a ON a.id=r.ad_id CROSS JOIN profile_head p
    JOIN profile_versions v ON v.id=r.profile_version_id JOIN source_ad_revisions ar ON ar.id=r.ad_revision_id JOIN matching_weight_versions w ON w.id=r.weights_version_id
    LEFT JOIN matching_rating_heads h ON h.ad_id=r.ad_id WHERE r.ad_id=$1 ORDER BY r.sequence DESC`,
      [adId],
    )
  ).rows
  return { current: rows.find((row) => row.is_current) ?? null, ratings: rows }
}
