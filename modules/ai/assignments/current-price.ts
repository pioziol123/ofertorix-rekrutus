import type { ExecutorParameters } from '../ports/executor.ts'
import type { PriceList } from '../domain/price-list.ts'
import { findExecutor } from '../infrastructure/adapters/registry.ts'
import type { AssignmentType } from '../domain/assignment.ts'
import { potentialCost } from '../domain/operation-cost.ts'
import { findOffer } from './resolve-executor.ts'

/** The price list valid now for an operation, with its potential cost. */
export type CurrentPrice = {
  priceList: PriceList | null
  potentialCost: string
}

/**
 * The price list the operation's executor declares now for the frozen type
 * and parameters of its assignment, and the potential cost under it
 * (T3-R02). Null when the executor, or its offer of those parameters, is no
 * longer declared.
 * ASSUMPTION(oferty-pracy-sq2.4/ASM-1): such an operation does not start;
 * its start throws and the background work's attempts and failure handler
 * decide its end (T4-R06), and the pass over operations waiting for the
 * budget leaves it waiting.
 */
export function currentPrice(frozen: {
  executor: string
  type: AssignmentType
  executorParameters: ExecutorParameters
}): CurrentPrice | null {
  const executor = findExecutor(frozen.executor)
  const offer =
    executor && findOffer(executor, frozen.type, frozen.executorParameters)
  if (!offer) return null
  return {
    priceList: offer.priceList,
    potentialCost: potentialCost(offer.priceList),
  }
}
