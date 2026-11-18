import type { ExecutionCause, ReceiverDecision } from '../ai/index.ts'
import {
  AssessmentError,
  validateAssessment,
} from '../../lib/matching/model.ts'
import {
  activeProfileVersion,
  currentAdVersions,
  publishAiRating,
} from '../../lib/matching/ratings.ts'
import { endMessage, rejectionMessage } from './domain/assessment-state.ts'
import {
  lockAssessmentRequest,
  saveAssessmentOutcome,
} from './infrastructure/persistence/assessment-requests.ts'

/**
 * Takes over the result of a request's assessment: checks it against the
 * request's own input (criteria, and evidence against the profile version
 * and the ad version the request recorded) and publishes it, or rejects it
 * with a safe diagnostic. Runs in AI's delivery transaction, so the
 * publication and the settlement commit together, and may run again with
 * the same result: the request is locked, and a result already published
 * for it is not published again. A result for inputs that are no longer
 * current is kept in the history without displacing a current assessment.
 */
export async function recordAssessmentResult(
  requestId: string,
  result: unknown,
): Promise<ReceiverDecision> {
  const request = await lockAssessmentRequest(requestId)
  if (request?.state !== 'requested')
    return { accepted: false, reason: 'unknown_request' }
  // Public reads without locks (0mq.13): a profile confirmed or an ad
  // changed since is the accepted race and shows as a stale assessment.
  const activeProfileVersionId = (await activeProfileVersion())?.id ?? null
  const currentAdVersionId = (await currentAdVersions([request.ad_id])).get(
    request.ad_id,
  )
  let assessment
  try {
    assessment = validateAssessment(result, request.input)
  } catch (error) {
    if (!(error instanceof AssessmentError)) throw error
    await saveAssessmentOutcome(requestId, {
      result: null,
      calculation: null,
      error: rejectionMessage(error.code),
    })
    return { accepted: false, reason: error.code }
  }
  const { calculation } = await publishAiRating(
    request,
    assessment,
    activeProfileVersionId,
    currentAdVersionId,
  )
  await saveAssessmentOutcome(requestId, {
    result: assessment,
    calculation,
    error: null,
  })
  return { accepted: true }
}

/**
 * Records that a request's assessment ended without a result, with the
 * owner's message for the public state and cause. Earlier assessments of
 * the ad stay as they are.
 */
export async function recordAssessmentEnd(
  requestId: string,
  end: { state: 'failed' | 'uncertain'; cause: ExecutionCause },
) {
  const request = await lockAssessmentRequest(requestId)
  if (request?.state !== 'requested') return
  await saveAssessmentOutcome(requestId, {
    result: null,
    calculation: null,
    error: endMessage(end),
  })
}
