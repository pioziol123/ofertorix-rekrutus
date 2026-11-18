import { transaction } from '../../lib/db.ts'
import {
  AiRequestError,
  readLatestExecution,
  type ExecutionCheck,
} from '../ai/index.ts'
import {
  checkProposalExecution,
  requestProposal,
} from './infrastructure/adapters/proposal-ai.ts'
import {
  importsWaitingForPreparation,
  lockWaitingPreparation,
  saveNoProposal,
  setImportStatus,
} from './infrastructure/persistence/imports.ts'
import { preparationMessage } from './domain/proposal-preparation.ts'

/**
 * Requests the next attempt of proposal preparations that were requested
 * but had not started when the Profile moved to the AI contract. The
 * migration ended their old executions as `retried`, releasing what they
 * reserved; this requests the same text revision again, which reserves the
 * budget again or waits for it. A preparation whose latest execution is
 * anything else is left alone, so the operation has no effect once those
 * preparations are resumed, and running it again is harmless.
 *
 * Kept for preparations stored by the former path (architecture rules,
 * cost 2: backward compatibility, justified by data stored in the old
 * format); it can go once no such preparation remains.
 */
export async function resumeProposalPreparations(): Promise<void> {
  let check: ExecutionCheck | null = null
  for (const importId of await importsWaitingForPreparation()) {
    const latest = await readLatestExecution(importId)
    if (latest?.state !== 'retried' || latest.inputVersion === null) continue
    const revision = Number(latest.inputVersion)
    try {
      check ??= await checkProposalExecution()
      const current = check
      await transaction(async () => {
        const text = await lockWaitingPreparation(importId, revision)
        if (text === null) return
        const requested = await requestProposal(
          importId,
          revision,
          text,
          current,
        )
        await setImportStatus(
          importId,
          requested.state === 'queued' ? 'ai_queued' : 'waiting_budget',
        )
      })
    } catch (error) {
      if (!(error instanceof AiRequestError)) throw error
      // The provider may answer in the next cycle; a request that cannot
      // be made at all ends the preparation with its message.
      if (
        error.code === 'provider_unavailable' ||
        error.code === 'operation_busy'
      )
        continue
      await saveNoProposal(
        importId,
        revision,
        preparationMessage({ state: 'failed', cause: 'configuration' }),
      )
    }
  }
}
