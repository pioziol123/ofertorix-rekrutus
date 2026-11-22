import type {
  Assessment,
  Criterion,
  MatchingInput,
  calculate,
} from './domain/assessment.ts'
import {
  assessmentState,
  failedAssignmentMessage,
} from './domain/assessment-state.ts'
import type { MatchingState } from './domain/assessment-view.ts'
import {
  assessmentReservation,
  assessmentsConfigured,
} from './infrastructure/adapters/assessment-ai.ts'
import { requestHistoryOfAd } from './infrastructure/persistence/assessment-requests.ts'
import { readRatings } from './ratings.ts'
import {
  activeProfileVersion,
  profileVersionNumbers,
  withAdVersionState,
  withProfileNumbers,
} from './read-assessment-inputs.ts'

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
   * Whether the request's AI work is an assignment, whose provider exchange
   * the exchange view shows (T8-R07). A request made before the deployment
   * of assignments has no exchange view (T10-R08).
   */
  assignment: boolean
  stale: boolean
}

/**
 * The assessment history and ratings of an ad, for the offer details. Each
 * request shows its state from Matching's own data (T8-R04); the cost of
 * AI work is in the AI assignments panel. A request made before the
 * deployment of assignments shows only what Matching stored itself
 * (T10-R08).
 */
export async function readMatching(adId: string) {
  const activeId = (await activeProfileVersion())?.id ?? null
  const rows = await requestHistoryOfAd(adId, failedAssignmentMessage)
  const requests = await withAdVersionState(
    rows.map(({ assignment_id: assignmentId, ...row }) => ({
      ...row,
      state: assessmentState({
        excluded: row.state === 'excluded',
        assessment: row.result !== null,
        message: row.error !== null,
      }),
      assignment: assignmentId !== null,
    })),
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
    // ASSUMPTION(oferty-pracy-sq2.9/ASM-3)
    maximumCostPln: assessmentReservation(),
    history,
    ...(await readRatings(adId, activeId)),
  }
}
