import type { ExecutionCause, ReceiverDecision } from '../ai/index.ts'
import { preparationMessage } from './domain/proposal-preparation.ts'
import { ProposalRejected, readProposal } from './domain/proposal-result.ts'
import {
  lockCurrentText,
  saveNoProposal,
  saveProposal,
} from './infrastructure/persistence/imports.ts'

/**
 * Takes over a prepared result for an import's text revision: checks the
 * proposal contract and the quotes against that revision and saves the
 * proposal with the import. A result for a revision that is no longer
 * current does not replace anything. Returns the decision; a rejected
 * result leaves the owner's message with the import, and the reason names
 * the rule it broke without any CV or model content.
 * Runs in the caller's transaction and may run again with the same result.
 */
export async function recordPreparationResult(
  importId: string,
  revision: number,
  result: unknown,
): Promise<ReceiverDecision> {
  const text = await lockCurrentText(importId, revision)
  if (text === null) return { accepted: false, reason: 'stale_revision' }
  try {
    await saveProposal(importId, revision, readProposal(result, text))
    return { accepted: true }
  } catch (error) {
    if (!(error instanceof ProposalRejected)) throw error
    await saveNoProposal(importId, revision, error.message)
    return { accepted: false, reason: error.reason }
  }
}

/**
 * Records that preparation for an import's text revision ended without a
 * result, with the owner's message for the public state and cause. A
 * revision that is no longer current is left alone.
 */
export async function recordPreparationEnd(
  importId: string,
  revision: number,
  end: { state: 'failed' | 'uncertain'; cause: ExecutionCause },
) {
  await saveNoProposal(importId, revision, preparationMessage(end))
}
