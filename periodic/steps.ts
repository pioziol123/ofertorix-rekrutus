import {
  failAssignmentsPastTimeLimit,
  sendOperationsWaitingForBudget,
} from '../modules/ai/index.ts'
import { requestScheduledSyncs } from '../modules/sources/index.ts'
import type { PeriodicStep } from './pass.ts'

/**
 * The steps of a pass of the periodic process, in order (B6-R09, T10-R04):
 * the operations waiting for the budget, the time limit of assignments and
 * the daily ad syncs. Each calls a module's public operation.
 */
export const periodicSteps: readonly PeriodicStep[] = [
  {
    name: 'send AI operations waiting for budget',
    run: () => sendOperationsWaitingForBudget(),
  },
  {
    name: 'fail AI assignments past their time limit',
    run: () => failAssignmentsPastTimeLimit(),
  },
  { name: 'request daily ad syncs', run: () => requestScheduledSyncs() },
]
