import { readLatestExecutions } from '../ai/index.ts'
import type {
  Assessment,
  Criterion,
  MatchingInput,
  calculate,
} from './domain/assessment.ts'
import {
  assessmentState,
  assignedAssessmentState,
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
   * The cost of the request's latest AI work of the old way, from the AI
   * read: reserved, and settled (null while it is not settled). Null for an
   * excluded request and for one with an assignment, whose cost is in the
   * AI assignments panel.
   */
  cost: { reserved: string; actual: string | null } | null
  /**
   * Whether the request's AI work is an assignment, whose provider exchange
   * the exchange view shows (T8-R07); else its archive of the old way.
   */
  assignment: boolean
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
        rows
          .filter((row) => row.state !== 'excluded' && !row.assignment_id)
          .map((row) => row.id),
      )
    ).map((execution) => [execution.operationId, execution]),
  )
  const requests = await withAdVersionState(
    rows.map(({ assignment_id: assignmentId, ...row }) => {
      if (assignmentId)
        return {
          ...row,
          state: assignedAssessmentState({
            assessment: row.result !== null,
            message: row.error !== null,
          }),
          cost: null,
          assignment: true,
        }
      const execution = executions.get(row.id) ?? null
      return {
        ...row,
        state: assessmentState(row.state, execution),
        cost: execution ? execution.cost : null,
        assignment: false,
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
    maximumCostPln: assessmentReservation(),
    history,
    ...(await readRatings(adId, activeId)),
  }
}
