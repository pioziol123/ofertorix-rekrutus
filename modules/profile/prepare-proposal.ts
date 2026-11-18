import { transaction } from '../../lib/db.ts'
import { scrubContacts } from '../../lib/profile/imports.ts'
import { ProfileConflict } from '../../lib/profile/store.ts'
import { AiRequestError } from '../ai/index.ts'
import {
  checkProposalExecution,
  proposalAiConfigured,
  requestProposal,
} from './infrastructure/adapters/proposal-ai.ts'
import {
  lockImport,
  saveTextRevision,
  setImportStatus,
} from './infrastructure/persistence/imports.ts'

export type PreparationRequest =
  | { state: 'needs_configuration' }
  | { state: 'queued' | 'waiting_budget'; executionId: string }

/**
 * Saves the owner's cleaned text as the import's new revision and requests
 * preparing a proposal from it, in one transaction: a refused request
 * leaves neither the text revision nor a reservation. Without AI
 * configuration the text is saved for later. The import has at most one
 * preparation in progress; another request is a conflict.
 */
export async function prepareProposal(
  importId: string,
  text: string,
  expectedRevision: number,
): Promise<PreparationRequest> {
  if (!text.trim() || text.length > 120000)
    throw new Error('Invalid professional text')
  const sanitized = scrubContacts(text)
  const configured = proposalAiConfigured()
  // The check may call the provider, so it runs before the transaction.
  const check = configured ? await checkProposalExecution() : null
  return transaction(async () => {
    const current = await lockImport(importId)
    if (!current) throw new Error('Import not found')
    if (current.textRevision !== expectedRevision)
      throw new ProfileConflict('Import text changed')
    if (!current.hasSourceText) throw new Error('Import has no extracted text')
    const revision = expectedRevision + 1
    await saveTextRevision(
      importId,
      revision,
      sanitized,
      check ? 'ready' : 'needs_configuration',
    )
    if (!check) return { state: 'needs_configuration' }
    let requested
    try {
      requested = await requestProposal(importId, revision, sanitized, check)
    } catch (error) {
      if (error instanceof AiRequestError && error.code === 'operation_busy')
        throw new ProfileConflict('A proposal is already pending')
      throw error
    }
    await setImportStatus(
      importId,
      requested.state === 'queued' ? 'ai_queued' : 'waiting_budget',
    )
    return requested
  })
}
