import {
  advanceSentBatches,
  cleanUpEndedBatches,
  fundWaitingExecutions,
} from '../modules/ai/index.ts'
import { resumeProposalPreparations } from '../modules/profile/index.ts'
import { requestScheduledSyncs } from '../modules/sources/index.ts'
import type { PeriodicStep } from './pass.ts'

/**
 * The steps of a pass of the periodic process, in order (B6-R09). Each
 * calls a module's public operation.
 */
export const periodicSteps: readonly PeriodicStep[] = [
  {
    name: 'fund AI executions waiting for budget',
    run: fundWaitingExecutions,
  },
  { name: 'advance sent AI batches', run: advanceSentBatches },
  { name: 'clean up ended AI batches', run: cleanUpEndedBatches },
  {
    name: 'resume profile proposal preparations',
    run: resumeProposalPreparations,
  },
  { name: 'request daily ad syncs', run: () => requestScheduledSyncs() },
]
