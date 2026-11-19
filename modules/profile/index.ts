/**
 * Public operations of the Profile module (the owner's professional
 * profile). Other modules and entry points use only these.
 */
export {
  readActiveProfileVersion,
  readProfileVersionMetadata,
  readProfileVersions,
  readVersionRecord,
  type ActiveProfileVersion,
  type ProfileVersion,
  type ProfileVersionMetadata,
} from './read-confirmed-versions.ts'
export type { ProfileData } from './domain/profile-data.ts'
export { confirmProfile, readProfile, saveDraft } from './edit-profile.ts'
export { ProfileConflict, ProposalNotFound } from './errors.ts'
export {
  importCvDocument,
  importCvText,
  readOriginalFile,
} from './import-cv.ts'
export { prepareProposal, type PreparationRequest } from './prepare-proposal.ts'
export { applyProposal, type ProposalApplication } from './apply-proposal.ts'
export {
  listImports,
  proposalAiConfigured,
  readImport,
} from './read-imports.ts'

// Composition: where the worker registers the receiver of proposal outcomes
// and resumes preparations stored by the former path.
export { resumeProposalPreparations } from './resume-proposal-preparations.ts'
export {
  proposalReceiver,
  proposalSettingsKey,
} from './infrastructure/adapters/proposal-ai.ts'

// Composition: where the worker extracts the text of uploaded documents and
// recovers stalled imports, and the queue schema is prepared.
export { recoverImports } from './extract-cv-text.ts'
export {
  parseQueue,
  parseQueueOptions,
  workCvTextQueue,
} from './infrastructure/worker/cv-text-queue.ts'
