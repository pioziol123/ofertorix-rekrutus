import type { ExecutionCause, ReceiverDecision } from '../ai/index.ts'
import { AssessmentError, validateAssessment } from './domain/assessment.ts'
import { publishAiRating } from './ratings.ts'
import {
  activeProfileVersion,
  currentAdVersions,
} from './read-assessment-inputs.ts'
import {
  endMessage,
  failedAssignmentMessage,
  rejectionMessage,
} from './domain/assessment-state.ts'
import {
  lockAssessmentRequest,
  lockAssignmentRequest,
  saveAssessmentOutcome,
  type AssessmentRequest,
} from './infrastructure/persistence/assessment-requests.ts'

/**
 * Checks a result against the request's own input (the assessment format,
 * its criteria, and evidence against the profile version and the ad
 * version the request recorded) and publishes it, or saves the owner's
 * message with a safe diagnostic of the rule it broke. A result for inputs
 * that are no longer current is kept in the history without displacing a
 * current assessment. The caller holds the lock on the request.
 */
async function checkAndPublish(
  request: AssessmentRequest,
  result: unknown,
): Promise<ReceiverDecision> {
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
    await saveAssessmentOutcome(request.id, {
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
  await saveAssessmentOutcome(request.id, {
    result: assessment,
    calculation,
    error: null,
  })
  return { accepted: true }
}

/**
 * Takes the result of an assessment's assignment (T8-R03): checks it by
 * Matching's own rules and publishes it, or ends the assessment as failed
 * with the message of the check it failed; either way the assignment
 * succeeds. A request whose outcome is already saved, or no request of the
 * assignment, changes nothing, so a repeated call has no further effect
 * (T6-R09). Runs in the caller's transaction.
 */
export async function takeAssessmentResult(
  assignmentId: string,
  result: unknown,
): Promise<void> {
  const request = await lockAssignmentRequest(assignmentId)
  if (!request || request.ended) return
  await checkAndPublish(request, result)
}

/**
 * Ends the assessment of a failed assignment as failed (T8-R03), with the
 * message for a failed assignment; earlier assessments of the ad stay as
 * they are. Like the result, it changes only a request whose outcome is not
 * saved yet. Runs in the caller's transaction.
 */
export async function endFailedAssessment(assignmentId: string): Promise<void> {
  const request = await lockAssignmentRequest(assignmentId)
  if (!request || request.ended) return
  await saveAssessmentOutcome(request.id, {
    result: null,
    calculation: null,
    error: failedAssignmentMessage,
  })
}

/**
 * Takes over the result of a request's assessment of the old way, checked
 * and published as a result of an assignment is. Runs in AI's delivery
 * transaction, so the publication and the settlement commit together, and
 * may run again with the same result: the request is locked, and a result
 * already published for it is not published again.
 */
export async function recordAssessmentResult(
  requestId: string,
  result: unknown,
): Promise<ReceiverDecision> {
  const request = await lockAssessmentRequest(requestId)
  if (request?.state !== 'requested')
    return { accepted: false, reason: 'unknown_request' }
  return checkAndPublish(request, result)
}

/**
 * Records that a request's assessment of the old way ended without a
 * result, with the
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
