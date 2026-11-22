import {
  endedAtDeploymentMessage,
  oldWayInProgress,
} from './domain/proposal-preparation.ts'
import { endPreparationsWithoutAssignment } from './infrastructure/persistence/imports.ts'

/**
 * Marks as failed every proposal preparation still waiting for AI work of
 * the old way at the deployment of assignments (T10-R02): one the import
 * records as in progress without an assignment. It ends with "Wymaga
 * sprawdzenia" (T7-R04) and the message of work ended at the deployment
 * (ASSUMPTION(oferty-pracy-sq2.11/ASM-3)), and a new preparation of the CV
 * can be requested. The migration step calls it after the database migrations;
 * it reads only the Profile's own data, a concurrent request of the same
 * CV is excluded because the step runs before the application starts, and
 * a second call finds nothing more to end. Returns how many it ended.
 */
export function failPreparationsOfOldWay(): Promise<number> {
  return endPreparationsWithoutAssignment(
    oldWayInProgress,
    endedAtDeploymentMessage,
  )
}
