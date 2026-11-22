import { countNeedingAttention } from '../infrastructure/persistence/panel.ts'

/**
 * The number of assignments needing attention (T11-R04), computed when
 * read, from committed state without row locks. The navigation of every
 * page shows it when it is above zero.
 */
export function countAssignmentsNeedingAttention(): Promise<number> {
  return countNeedingAttention()
}
