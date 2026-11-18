import {
  activeProfileVersion,
  adsForAssessment,
  profileVersionNumbers,
  readRatings,
  withAdVersionState,
  withProfileNumbers,
} from './ratings.ts'
import { randomUUID } from 'node:crypto'
import {
  AiRequestError,
  readLatestExecution,
  readLatestExecutions,
  type ExecutionCheck,
} from '../../modules/ai/index.ts'
import { db, transaction } from '../db.ts'
import type { ProfileVersion } from '../../modules/profile/index.ts'
import type { SourceAd } from '../../modules/sources/index.ts'
import {
  exceedsCriteria,
  matchingInput,
  type MatchingInput,
  type Assessment,
  type Criterion,
  type calculate,
} from './model.ts'
import {
  assessmentReservation,
  assessmentsConfigured,
  checkAssessmentExecution,
  requestAssessment,
} from '../../modules/matching/infrastructure/adapters/assessment-ai.ts'
import {
  assessmentState,
  inputLimitMessage,
  notConfiguredMessage,
  refusalMessage,
} from '../../modules/matching/domain/assessment-state.ts'
import {
  insertAssessmentRequest,
  latestRequestedOfAd,
  linkExecution,
  lockAdRequests,
  requestHistoryOfAd,
} from '../../modules/matching/infrastructure/persistence/assessment-requests.ts'
import { matchingPending, type MatchingState } from './view.ts'
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

export type MatchingHistory = {
  id: string
  state: MatchingState
  result: Assessment | null
  calculation: ReturnType<typeof calculate> | null
  error: string | null
  created_at: Date
  updated_at: Date
  profile_version_id: string
  profile_number: number
  offer_version_at: Date
  ad_revision_id: string
  checks: MatchingInput['checks']
  criteria: Criterion[]
  /**
   * The cost of the request's latest AI work, from the AI read: reserved,
   * and settled (null while it is not settled). Null for an excluded
   * request.
   */
  cost: { reserved: string; actual: string | null } | null
  stale: boolean
}

/** The assessment history and ratings of an ad, for the offer details. */
export async function readMatching(adId: string) {
  const activeId = (await activeProfileVersion())?.id ?? null
  const rows = await requestHistoryOfAd(adId)
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the AI work of every request in
  // one public read.
  const executions = new Map(
    (
      await readLatestExecutions(
        rows.filter((row) => row.state !== 'excluded').map((row) => row.id),
      )
    ).map((execution) => [execution.operationId, execution]),
  )
  const requests = await withAdVersionState(
    rows.map((row) => {
      const execution = executions.get(row.id) ?? null
      return {
        ...row,
        state: assessmentState(row.state, execution),
        cost: execution ? execution.cost : null,
      }
    }),
    adId,
    activeId,
  )
  const numbers = await profileVersionNumbers(
    requests.map((row) => row.profile_version_id),
  )
  const history: MatchingHistory[] = withProfileNumbers(requests, numbers)
  return {
    configured: assessmentsConfigured(),
    profileReady: activeId !== null,
    // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the reservation read.
    maximumCostPln: assessmentReservation('single'),
    history,
    ...(await readRatings(db(), adId, activeId)),
  }
}
