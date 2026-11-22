import { AssessmentError, validateAssessment } from './domain/assessment.ts'
import { publishAiRating } from './ratings.ts'
import {
  activeProfileVersion,
  currentAdVersions,
} from './read-assessment-inputs.ts'
import {
  failedAssignmentMessage,
  rejectionMessage,
} from './domain/assessment-state.ts'
import {
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
): Promise<void> {
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
    return
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
