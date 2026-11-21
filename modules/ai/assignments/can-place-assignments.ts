import { AssignmentError, type AssignmentType } from './assignment.ts'
import { resolveExecutor } from './resolve-executor.ts'

/**
 * Whether assignments of the type can be placed under the settings name
 * now (T1-R08): the settings are known and complete, the executor serves
 * the type with these parameters and has its configuration. No provider is
 * called. The content of an assignment can still be refused when placed.
 */
export function canPlaceAssignments(
  settingsName: string,
  type: AssignmentType,
): boolean {
  try {
    resolveExecutor(settingsName, type)
    return true
  } catch (error) {
    if (error instanceof AssignmentError) return false
    throw error
  }
}
