import { readAssignmentExchange } from '../ai/index.ts'
import { requestAssignment } from './infrastructure/persistence/assessment-requests.ts'

/**
 * The diagnostic record of what a request's assessment sent to the
 * provider and what came back: the exchange kept with each of its
 * assignment's operations, read through the AI module's exchange read
 * (T8-R07). It contains professional profile data and complete provider
 * output, so it stays outside the normal history and logs, as requested by
 * the owner. Null for an unknown request and for one without an
 * assignment: an assessment made before the deployment of assignments has
 * no exchange view (T10-R08).
 */
export async function readAssessmentExchange(requestId: string) {
  const request = await requestAssignment(requestId)
  if (!request?.assignmentId) return null
  const exchange = await readAssignmentExchange(request.assignmentId)
  return {
    kind: 'exchange' as const,
    assignmentId: request.assignmentId,
    operations: exchange?.operations ?? [],
  }
}
