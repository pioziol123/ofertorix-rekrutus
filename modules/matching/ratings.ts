import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { transaction } from '../../lib/db.ts'
import { readAdVersions } from '../sources/index.ts'
import {
  assessmentSchema,
  calculate,
  matchingInput,
  validateAssessment,
  type Assessment,
  type MatchingInput,
} from './domain/assessment.ts'
import { weightsSchema } from './domain/weights.ts'
import {
  activeWeights,
  findWeightCommand,
  insertRevision,
  insertWeightCommand,
  insertWeightVersion,
  lockRatings,
  ratingHead,
  ratingHeads,
  ratingHistory,
  revisionOfCommand,
  revisionOfRequest,
  weightVersions,
  type RatingHistoryRow,
  type WeightVersion,
} from './infrastructure/persistence/ratings.ts'
import {
  activeProfileVersion,
  adsForAssessment,
  currentAdVersions,
  profileVersionNumbers,
  withAdVersionState,
  withProfileNumbers,
} from './read-assessment-inputs.ts'
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
export async function readWeights() {
  const rows = await weightVersions()
  const current = rows.find((row) => row.current)
  if (!current) throw new Error('Missing weights')
  return { current, history: rows }
}
/** Calculates a revision with the given weights and saves it. */
async function saveRevision(
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
  await insertRevision(
    {
      id,
      adId: value.adId,
      profileVersionId: value.profileVersionId,
      adRevisionId: value.adRevisionId,
      input: value.input,
      result: value.result,
      calculation,
      weightsVersionId: weights.id,
      author: value.author,
      assessmentAuthor: value.assessmentAuthor,
      reason: value.reason,
      previousId: value.previousId,
      basisId: value.basisId ?? null,
      requestId: value.requestId ?? null,
      commandId: value.commandId ?? null,
      commandHash: value.commandHash ?? null,
    },
    promote,
  )
  return { id, calculation }
}
// The caller owns the transaction: AI cost, request result and rating publish commit together.
// The caller reads the active profile version and the ad's current version
// before its transaction, without a lock; a change in between is accepted
// (owner's decision in 0mq.13). The ad's current version is undefined when
// the ad no longer exists.
export async function publishAiRating(
  request: {
    id: string
    ad_id: string
    profile_version_id: string
    ad_revision_id: string
    input: MatchingInput
  },
  result: Assessment,
  activeProfileVersionId: string | null,
  currentAdVersionId: string | undefined,
) {
  await lockRatings()
  const existing = await revisionOfRequest(request.id)
  if (existing) return existing
  const weights = await activeWeights(),
    previous = await ratingHead(request.ad_id)
  if (currentAdVersionId === undefined)
    throw new RatingConflict('Nie znaleziono oferty.')
  const adRevisionId = currentAdVersionId
  const isFresh = (profile: string, ad: string) =>
    profile === activeProfileVersionId && ad === adRevisionId
  const promote =
    isFresh(request.profile_version_id, request.ad_revision_id) ||
    !previous ||
    !isFresh(previous.profile_version_id, previous.ad_revision_id)
  return saveRevision(
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
export async function manualContext(adId: string) {
  const profile = await activeProfileVersion()
  if (!profile) return null
  const ad = (await adsForAssessment([adId])).get(adId)
  if (!ad) throw new RatingConflict('Nie znaleziono oferty.')
  const previous = await ratingHead(adId),
    input = matchingInput(profile.data, ad)
  const same =
    previous?.profile_version_id === profile.id &&
    previous?.ad_revision_id === ad.versionId
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
    adRevisionId: ad.versionId,
    input,
    assessment,
    staleBase: !!previous && !same,
  }
}
export async function saveManualRating(adId: string, value: unknown) {
  const command = manualRatingCommand.parse(value),
    hash = fingerprint({ adId: adId.toLowerCase(), ...command })
  // Read before the transaction holds a connection; the reads take no lock.
  // The content assessed is that of the version the owner's form names.
  const profile = await activeProfileVersion()
  const currentAdVersionId = (await currentAdVersions([adId])).get(adId)
  const [assessedAd] = await readAdVersions([command.adRevisionId])
  return transaction(async () => {
    await lockRatings()
    const duplicate = await revisionOfCommand(command.commandId)
    if (duplicate) {
      if (duplicate.command_hash !== hash)
        throw new RatingConflict('Identyfikator zapisu dotyczy innej treści.')
      return { id: String(duplicate.id), reused: true }
    }
    const previous = await ratingHead(adId)
    if (currentAdVersionId === undefined)
      throw new RatingConflict('Nie znaleziono oferty.')
    if (
      (previous?.id ?? null) !== command.expectedRevisionId ||
      profile?.id !== command.profileVersionId ||
      currentAdVersionId !== command.adRevisionId ||
      !assessedAd
    )
      throw new RatingConflict(
        'Ocena, profil lub ogłoszenie zmieniły się. Wczytaj aktualne dane przed zapisem; Twój formularz nie został zapisany.',
      )
    const context = matchingInput(profile.data, assessedAd)
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
    const revision = await saveRevision(
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
      await activeWeights(),
    )
    return { id: revision.id, reused: false }
  })
}
export async function saveWeights(value: unknown) {
  const command = weightCommand.parse(value),
    hash = fingerprint(command)
  return transaction(async () => {
    await lockRatings()
    const duplicate = await findWeightCommand(command.commandId)
    if (duplicate) {
      if (duplicate.command_hash !== hash)
        throw new RatingConflict('Identyfikator zapisu dotyczy innych wag.')
      return { versionId: String(duplicate.id), updated: 0, reused: true }
    }
    const previous = await activeWeights()
    if (previous.id !== command.expectedVersionId)
      throw new RatingConflict(
        'Wagi zmieniły się. Wczytaj aktualną wersję przed zapisem.',
      )
    if (JSON.stringify(previous.weights) === JSON.stringify(command.weights)) {
      await insertWeightCommand(command.commandId, hash, previous.id)
      return { versionId: previous.id, updated: 0, reused: false }
    }
    const id = randomUUID()
    await insertWeightVersion({
      id,
      weights: command.weights,
      previousId: previous.id,
      commandId: command.commandId,
      hash,
    })
    const weights = await activeWeights()
    const rows = await ratingHeads()
    for (const row of rows)
      await saveRevision(
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
    await insertWeightCommand(command.commandId, hash, id)
    return { versionId: id, updated: rows.length, reused: false }
  })
}
export type RatingView = RatingHistoryRow & {
  profile_number: number
  offer_version_at: Date
  stale: boolean
}
/** The rating history of an ad, stale against the given active profile version. */
export async function readRatings(
  adId: string,
  activeProfileVersionId: string | null,
) {
  const found = await withAdVersionState(
    await ratingHistory(adId),
    adId,
    activeProfileVersionId,
  )
  const rows: RatingView[] = withProfileNumbers(
    found,
    await profileVersionNumbers(found.map((row) => row.profile_version_id)),
  )
  return { current: rows.find((row) => row.is_current) ?? null, ratings: rows }
}
