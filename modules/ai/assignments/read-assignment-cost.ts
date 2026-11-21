import { readAssignmentCostRow } from '../infrastructure/persistence/operations.ts'

/** The cost figures of an assignment (T3-R08), amounts in złoty. */
export type AssignmentCost = {
  /** The sum of its operations' potential costs. */
  potential: string
  /** The sum of their known actual costs. */
  actual: string
  /** Its budget charge: per started operation ZA-R04's charge. */
  charge: string
  /** The number of its operations whose actual cost is unknown. */
  unknownCosts: number
}

/**
 * Computes the cost figures of an assignment from its operations when they
 * are read; nothing stores a sum (solution design of epic sq2, "Data"). An
 * operation that never started adds nothing. The panel of the AI module
 * shows them from task oferty-pracy-sq2.12.
 */
export async function readAssignmentCost(
  assignmentId: string,
): Promise<AssignmentCost> {
  const row = await readAssignmentCostRow(assignmentId)
  return {
    potential: row.potential,
    actual: row.actual,
    charge: row.charge,
    unknownCosts: row.unknown,
  }
}
