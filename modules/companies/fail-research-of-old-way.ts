import { endedAtDeploymentMessage } from './domain/research-outcome.ts'
import { endResearchWithoutAssignment } from './infrastructure/persistence/research-records.ts'

/**
 * Marks as failed every research still waiting for AI work of the old way
 * at the deployment of assignments (T10-R02): research without an
 * assignment whose outcome is not saved. It ends with the message of work
 * ended at the deployment, so it shows "Nie udało się przygotować raportu"
 * (T9-R03) and new research of the company can be requested; the previous
 * report stays available. The migration step calls it after the database
 * migrations; it reads only Companies' own data, a concurrent request is
 * excluded because the step runs before the application starts, and a
 * second call finds nothing more to end. Returns how many it ended.
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-1): that message keeps such research
 * in the company's history. ASSUMPTION(oferty-pracy-sq2.11/ASM-3): its
 * wording.
 */
export function failResearchOfOldWay(): Promise<number> {
  return endResearchWithoutAssignment(endedAtDeploymentMessage)
}
