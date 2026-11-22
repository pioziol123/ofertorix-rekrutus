import { AssignmentError, type AssignmentType } from './assignment.ts'
import { potentialCost } from './operation-cost.ts'
import { resolveExecutor } from './resolve-executor.ts'

/**
 * The potential cost of one operation of an assignment of the type placed
 * under the settings name now (ZA-R04): the cost of the caps of the price
 * list its executor declares for the settings' parameters, in złoty as a
 * decimal string, zero for an executor without a price list; null when
 * such assignments cannot be placed now (T1-R08). No provider is called.
 * It is the most one operation holds of the month's budget when it starts.
 *
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-2): the read that replaces the old
 * way's reservation read, which Matching's views used to show the most one
 * assessment reserves. ASSUMPTION(oferty-pracy-sq2.9/ASM-3): the offer
 * views keep showing that figure.
 */
export function readPotentialCost(
  settingsName: string,
  type: AssignmentType,
): string | null {
  try {
    return potentialCost(resolveExecutor(settingsName, type).offer.priceList)
  } catch (error) {
    if (error instanceof AssignmentError) return null
    throw error
  }
}
