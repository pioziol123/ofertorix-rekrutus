import { readLatestExecutions } from '../ai/index.ts'
import type {
  Assessment,
  Criterion,
  MatchingInput,
  calculate,
} from './domain/assessment.ts'
import { assessmentState } from './domain/assessment-state.ts'
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
    ...(await readRatings(adId, activeId)),
  }
}
