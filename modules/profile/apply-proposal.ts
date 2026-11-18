import { transaction } from '../../lib/db.ts'
import {
  applyProposal as mergeProposal,
  checkProposal,
} from '../../lib/profile/model.ts'
import { currentDraft, writeDraft } from './edit-profile.ts'
import { ProfileConflict, ProposalNotFound } from './errors.ts'
import { findSavedProposal } from './infrastructure/persistence/imports.ts'
import { lockHead } from './infrastructure/persistence/profile.ts'

/** The owner's choice of proposal items to put into the draft. */
export type ProposalApplication = {
  importId: string
  /** The draft revision the owner saw when choosing. */
  expectedRevision: number
  /** Indexes of the proposed skills and experience to take. */
  skills: number[]
  experience: number[]
  /** Whether to take the proposed summary. */
  summary: boolean
  /** Proposed item index → id of the draft item it replaces. */
  skillTargets?: Record<string, string>
  experienceTargets?: Record<string, string>
}

/**
 * Applies the chosen items of an import's proposal to the draft, in one
 * transaction: reads the proposal with the text revision it was prepared
 * for, checks the draft revision, checks the quotes against that text,
 * merges the items and saves the draft's next revision. Returns the saved
 * draft. An import without a proposal gives ProposalNotFound, a changed
 * draft gives ProfileConflict, and an invalid selection or quote gives an
 * error; none of them writes anything.
 */
export async function applyProposal(command: ProposalApplication) {
  return transaction(async () => {
    const activeId = await lockHead()
    // ASSUMPTION(oferty-pracy-0mq.11/ASM-1): the command carries no text
    // revision; the proposal is applied with the text revision it was
    // prepared for, which is the import's current one, as the route did.
    const saved = await findSavedProposal(command.importId)
    if (!saved) throw new ProposalNotFound()
    const draft = await currentDraft()
    if (draft.revision !== command.expectedRevision)
      throw new ProfileConflict('Draft changed')
    const proposal = checkProposal(saved.proposal, saved.text)
    const next = mergeProposal(
      draft.data as Parameters<typeof mergeProposal>[0],
      proposal,
      command,
      command.importId,
      saved.textRevision,
    )
    return writeDraft(next, command.expectedRevision, activeId)
  })
}
