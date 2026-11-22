import { transaction } from '../../lib/db.ts'
import { scrubContacts } from '../../lib/contact-details.ts'
import { ProfileConflict } from './errors.ts'
import { assignmentInProgress } from './domain/proposal-preparation.ts'
import {
  placeProposalAssignment,
  proposalAiConfigured,
} from './infrastructure/adapters/proposal-ai.ts'
import {
  lockImport,
  saveTextRevision,
} from './infrastructure/persistence/imports.ts'

export type PreparationRequest =
  { state: 'needs_configuration' } | { state: 'in_progress' }

/**
 * The label of a preparation's assignment for the owner: the CV's file
 * name (T7-R01). ASSUMPTION(oferty-pracy-sq2.8/ASM-1): a pasted CV, which
 * has no file name, is labelled as the profile page names it.
 */
const assignmentLabel = (originalName: string | null) =>
  originalName?.trim() ? originalName : 'Wklejony tekst'

/**
 * Saves the owner's cleaned text as the import's new revision and places
 * the assignment that prepares a proposal from it, keeping its identifier
 * with that revision, in one transaction: a refused assignment leaves
 * neither the text revision nor the assignment (T7-R01). Without AI
 * configuration the text is saved for later. The import has at most one
 * preparation in progress, the Profile's own record of it decides, and
 * another request is a conflict (T7-R02).
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
  return transaction(async () => {
    const current = await lockImport(importId)
    if (!current) throw new Error('Import not found')
    if (current.textRevision !== expectedRevision)
      throw new ProfileConflict('Import text changed')
    if (!current.hasSourceText) throw new Error('Import has no extracted text')
    // ASSUMPTION(oferty-pracy-sq2.8/ASM-2): the import's own status decides.
    if (current.status === assignmentInProgress)
      throw new ProfileConflict('A proposal is already pending')
    const revision = expectedRevision + 1
    if (!configured) {
      await saveTextRevision(
        importId,
        revision,
        sanitized,
        'needs_configuration',
        null,
      )
      return { state: 'needs_configuration' }
    }
    const assignmentId = await placeProposalAssignment(
      assignmentLabel(current.originalName),
      sanitized,
    )
    await saveTextRevision(
      importId,
      revision,
      sanitized,
      assignmentInProgress,
      assignmentId,
    )
    return { state: 'in_progress' }
  })
}
