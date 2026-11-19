import {
  activeProfileVersion,
  adsForAssessment,
} from './read-assessment-inputs.ts'
import { randomUUID } from 'node:crypto'
import {
  AiRequestError,
  readLatestExecution,
  type ExecutionCheck,
} from '../ai/index.ts'
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
  checkAssessmentExecution,
  requestAssessment,
} from './infrastructure/adapters/assessment-ai.ts'
import {
  assessmentState,
  inputLimitMessage,
  notConfiguredMessage,
  refusalMessage,
} from './domain/assessment-state.ts'
import {
  insertAssessmentRequest,
  latestRequestedOfAd,
  linkExecution,
  lockAdRequests,
} from './infrastructure/persistence/assessment-requests.ts'
import {
  matchingPending,
  type MatchingState,
} from './domain/assessment-view.ts'
export class MatchingError extends Error {}

/** A prepared request: an existing one in progress, or a new one. */
export type PreparedRequest = {
  id: string
  state: MatchingState
  reused: boolean
  /** The input of a new request that still needs its AI work requested. */
  toRequest: MatchingInput | null
}

/**
 * Prepares the assessment request of an ad in the caller's transaction:
 * the ad's request whose AI work is still in progress, or a new request
 * with the input fixed from the given profile version and ad version. A
 * request whose required conditions conflict is excluded and needs no AI
 * work. Requests of one ad are prepared one at a time (a transaction lock),
 * so an ad has at most one request in progress.
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
): Promise<PreparedRequest> {
  await lockAdRequests(adId)
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-1): under the ad lock, the ad's
  // assessment still in progress in AI is reused; this keeps one
  // assessment in progress per ad.
  const previous = await latestRequestedOfAd(adId)
  if (previous) {
    const execution = await readLatestExecution(previous.id)
    const state = assessmentState('requested', execution)
    if (execution && matchingPending.some((pending) => pending === state))
      return { id: previous.id, state, reused: true, toRequest: null }
  }
  if (!profile) throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
  if (!ad) throw new MatchingError('Nie znaleziono oferty.')
  const input = matchingInput(profile.data, ad)
  const id = randomUUID()
  const excluded = input.checks.some((c) => c.state === 'conflict')
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-6): more criteria than an assessment
  // covers is refused for every request that needs AI work.
  if (!excluded && exceedsCriteria(input))
    throw new MatchingError(inputLimitMessage(kind))
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
    : { id, state: 'queued', reused: false, toRequest: input }
}

/**
 * Requests the assessment of one offer as a single AI execution. An
 * assessment of the offer still in progress is reused.
 */
export async function enqueueMatching(adId: string) {
  if (!assessmentsConfigured()) throw new MatchingError(notConfiguredMessage)
  const profile = await activeProfileVersion()
  const ad = (await adsForAssessment([adId])).get(adId)
  let check: ExecutionCheck
  try {
    check = await checkAssessmentExecution()
  } catch (error) {
    if (error instanceof AiRequestError)
      throw new MatchingError(refusalMessage(error.code, 'single'))
    throw error
  }
  try {
    return await transaction(async () => {
      const prepared = await prepareMatching(adId, profile, ad, 'single')
      if (!prepared.toRequest)
        return {
          id: prepared.id,
          state: prepared.state,
          reused: prepared.reused,
        }
      const requested = await requestAssessment(
        prepared.id,
        prepared.toRequest,
        check,
      )
      await linkExecution(prepared.id, requested.executionId)
      return { id: prepared.id, state: requested.state, reused: false }
    })
  } catch (error) {
    if (error instanceof AiRequestError)
      throw new MatchingError(refusalMessage(error.code, 'single'))
    throw error
  }
}
