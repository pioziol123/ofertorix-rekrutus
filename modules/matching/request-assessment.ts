import {
  activeProfileVersion,
  adsForAssessment,
} from './read-assessment-inputs.ts'
import { randomUUID } from 'node:crypto'
import { AssignmentError } from '../ai/index.ts'
import { transaction } from '../../lib/db.ts'
import type { ProfileVersion } from '../profile/index.ts'
import type { SourceAd } from '../sources/index.ts'
import {
  exceedsCriteria,
  matchingInput,
  type MatchingInput,
} from './domain/assessment.ts'
import {
  assessmentsConfigured,
  placeAssessmentAssignment,
} from './infrastructure/adapters/assessment-ai.ts'
import {
  assignedAssessmentState,
  assignmentRefusalMessage,
  inputLimitMessage,
  notConfiguredMessage,
} from './domain/assessment-state.ts'
import {
  insertAssessmentRequest,
  latestRequestedOfAd,
  linkAssignment,
  lockAdRequests,
  type RequestProgress,
} from './infrastructure/persistence/assessment-requests.ts'
import type { MatchingState } from './domain/assessment-view.ts'
export class MatchingError extends Error {}

/** A prepared request: an existing one in progress, or a new one. */
export type PreparedRequest = {
  id: string
  state: MatchingState
  reused: boolean
  /** The input of a new request that still needs its assignment placed. */
  toRequest: { input: MatchingInput; label: string } | null
}

/**
 * The state of a request's AI work while it is in progress, else null,
 * from Matching's own data alone: in progress until an outcome is saved
 * (T8-R04, T8-AC08).
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-4): also for a request of the old way,
 * which has no assignment; one whose old work ended without an outcome
 * reaching Matching stays in progress until task oferty-pracy-sq2.11 ends
 * it.
 */
function progressState(request: RequestProgress): MatchingState | null {
  return request.ended
    ? null
    : assignedAssessmentState({ assessment: false, message: false })
}

/** The label of an assessment's assignment: the offer's title and employer. */
const assignmentLabel = (ad: SourceAd) => `${ad.title} — ${ad.company}`

/**
 * Prepares the assessment request of an ad in the caller's transaction:
 * the ad's request whose AI work is still in progress, or a new request
 * with the input fixed from the given profile version and ad version. A
 * request whose required conditions conflict is excluded and needs no AI
 * work. Requests of one ad are prepared one at a time (a transaction lock),
 * so an ad has at most one request in progress. A new request gets the
 * given identifier, or a new one.
 */
export async function prepareMatching(
  adId: string,
  // The active version read before the transaction; one read per enqueue, so a
  // group uses one version for all its offers.
  profile: ProfileVersion | null,
  // The ad read before the transaction, without a lock (see
  // adsForAssessment); undefined when it does not exist.
  ad: SourceAd | undefined,
  kind: 'single' | 'group',
  // ASSUMPTION(oferty-pracy-sq2.9/ASM-1): the identifier a group command
  // gives a request with AI work; random otherwise.
  newId: () => string = randomUUID,
): Promise<PreparedRequest> {
  await lockAdRequests(adId)
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-1): under the ad lock, the ad's
  // assessment still in progress is reused; this keeps one assessment in
  // progress per ad.
  const previous = await latestRequestedOfAd(adId)
  if (previous) {
    const state = progressState(previous)
    if (state) return { id: previous.id, state, reused: true, toRequest: null }
  }
  if (!profile) throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
  if (!ad) throw new MatchingError('Nie znaleziono oferty.')
  const input = matchingInput(profile.data, ad)
  const excluded = input.checks.some((c) => c.state === 'conflict')
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-6): more criteria than an assessment
  // covers is refused for every request that needs AI work.
  if (!excluded && exceedsCriteria(input))
    throw new MatchingError(inputLimitMessage(kind))
  // ASSUMPTION(oferty-pracy-sq2.9/ASM-1): an excluded request always gets a
  // random identifier, so a command handled again as new never saves the
  // same identifier twice.
  const id = excluded ? randomUUID() : newId()
  await insertAssessmentRequest({
    id,
    adId,
    adRevisionId: ad.versionId,
    profileVersionId: profile.id,
    input,
    state: excluded ? 'excluded' : 'requested',
  })
  return excluded
    ? { id, state: 'excluded', reused: false, toRequest: null }
    : {
        id,
        state: 'running',
        reused: false,
        toRequest: { input, label: assignmentLabel(ad) },
      }
}

/**
 * Places the assignment of a prepared request and keeps its identifier
 * with the request, in the caller's transaction (T8-R01).
 */
export async function placePrepared(
  requestId: string,
  toRequest: NonNullable<PreparedRequest['toRequest']>,
) {
  const assignmentId = await placeAssessmentAssignment(
    toRequest.label,
    toRequest.input,
  )
  await linkAssignment(requestId, assignmentId)
}

/**
 * Requests the assessment of one offer as one single-answer assignment
 * (T8-R01). An assessment of the offer still in progress is reused. A
 * refused assignment, e.g. an oversized one (T8-R05), leaves nothing.
 */
export async function enqueueMatching(adId: string) {
  if (!assessmentsConfigured()) throw new MatchingError(notConfiguredMessage)
  const profile = await activeProfileVersion()
  const ad = (await adsForAssessment([adId])).get(adId)
  try {
    return await transaction(async () => {
      const prepared = await prepareMatching(adId, profile, ad, 'single')
      if (prepared.toRequest)
        await placePrepared(prepared.id, prepared.toRequest)
      return {
        id: prepared.id,
        state: prepared.state,
        reused: prepared.reused,
      }
    })
  } catch (error) {
    if (error instanceof AssignmentError)
      throw new MatchingError(assignmentRefusalMessage(error.code, 'single'))
    throw error
  }
}
