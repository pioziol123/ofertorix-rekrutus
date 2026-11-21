import type { ExecutionCause, ReceiverDecision } from '../ai/index.ts'
import {
  assignmentInProgress,
  failedAssignmentMessage,
  preparationMessage,
} from './domain/proposal-preparation.ts'
import { ProposalRejected, readProposal } from './domain/proposal-result.ts'
import {
  lockAssignmentPreparation,
  lockCurrentText,
  saveNoProposal,
  saveProposal,
} from './infrastructure/persistence/imports.ts'

/**
 * Saves the proposal of a result for the import's text revision once it
 * passes the Profile's check (the proposal format and the quotes found in
 * that revision's text), or the owner's message of the check it failed.
 */
async function saveCheckedProposal(
  importId: string,
  revision: number,
  text: string,
  result: unknown,
): Promise<ReceiverDecision> {
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
 * Takes the result of a preparation's assignment (T7-R03): checks the
 * proposal against the Profile's format and the text revision the
 * assignment was placed for, and saves it, or the message of the check it
 * failed, ending the preparation either way. An assignment no longer kept
 * by an import in preparation, e.g. one placed for an older revision or
 * one whose end was already taken, changes nothing, so a repeated call has
 * no further effect (T6-R09). Runs in the caller's transaction.
 */
export async function takeAssignmentResult(
  assignmentId: string,
  result: unknown,
): Promise<void> {
  const preparation = await lockAssignmentPreparation(
    assignmentId,
    assignmentInProgress,
  )
  if (!preparation) return
  await saveCheckedProposal(
    preparation.importId,
    preparation.revision,
    preparation.text,
    result,
  )
}

/**
 * Ends the preparation of a failed assignment with the message for a
 * failed assignment (T7-R03, T7-R04), so a new one can be requested. Like
 * the result, it changes only a preparation still in progress for the
 * assignment. Runs in the caller's transaction.
 */
export async function endAssignmentPreparation(
  assignmentId: string,
): Promise<void> {
  const preparation = await lockAssignmentPreparation(
    assignmentId,
    assignmentInProgress,
  )
  if (!preparation) return
  await saveNoProposal(
    preparation.importId,
    preparation.revision,
    failedAssignmentMessage,
  )
}

/**
 * Takes over a prepared result of the old way for an import's text
 * revision: checks the proposal contract and the quotes against that
 * revision and saves the proposal with the import. A result for a revision
 * that is no longer current does not replace anything. Returns the
 * decision; a rejected result leaves the owner's message with the import,
 * and the reason names the rule it broke without any CV or model content.
 * Runs in the caller's transaction and may run again with the same result.
 */
export async function recordPreparationResult(
  importId: string,
  revision: number,
  result: unknown,
): Promise<ReceiverDecision> {
  const text = await lockCurrentText(importId, revision)
  if (text === null) return { accepted: false, reason: 'stale_revision' }
  return saveCheckedProposal(importId, revision, text, result)
}

/**
 * Records that preparation of the old way for an import's text revision
 * ended without a result, with the owner's message for the public state
 * and cause. A revision that is no longer current is left alone.
 */
export async function recordPreparationEnd(
  importId: string,
  revision: number,
  end: { state: 'failed' | 'uncertain'; cause: ExecutionCause },
) {
  await saveNoProposal(importId, revision, preparationMessage(end))
}
