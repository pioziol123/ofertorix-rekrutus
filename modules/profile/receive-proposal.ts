import {
  assignmentInProgress,
  failedAssignmentMessage,
} from './domain/proposal-preparation.ts'
import { ProposalRejected, readProposal } from './domain/proposal-result.ts'
import {
  lockAssignmentPreparation,
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
): Promise<void> {
  try {
    await saveProposal(importId, revision, readProposal(result, text))
  } catch (error) {
    if (!(error instanceof ProposalRejected)) throw error
    await saveNoProposal(importId, revision, error.message)
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
