import { endedAtDeploymentMessage } from './domain/assessment-state.ts'
import { endRequestsWithoutAssignment } from './infrastructure/persistence/assessment-requests.ts'

/**
 * Marks as failed every assessment still waiting for AI work of the old
 * way at the deployment of assignments (T10-R02): a request that requested
 * AI work, has no assignment and no saved outcome. It ends with the message
 * of work ended at the deployment, so the offer shows "Ocena nie powiodła
 * się" (T8-R04) and a new assessment can be requested. The migration step calls
 * it after the database migrations; it reads only Matching's own data, a
 * concurrent request is excluded because the step runs before the
 * application starts, and a second call finds nothing more to end. Returns
 * how many it ended.
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-1): that message keeps such a request
 * in the offer's history. ASSUMPTION(oferty-pracy-sq2.11/ASM-3): its
 * wording.
 */
export function failAssessmentsOfOldWay(): Promise<number> {
  return endRequestsWithoutAssignment(endedAtDeploymentMessage)
}
