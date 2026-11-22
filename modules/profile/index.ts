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

// Composition: the receiver of the Profile's assignments, which the shared
// registration of receivers registers under its settings name (epic sq2,
// T6), and the end of preparations of the old way, which the migration
// step calls at the deployment of assignments (T10-R02).
export {
  proposalAssignmentReceiver,
  proposalSettingsKey,
} from './infrastructure/adapters/proposal-ai.ts'
export { failPreparationsOfOldWay } from './fail-preparations-of-old-way.ts'

// Composition: the job of reading a CV's text, with the handlers the
// Profile module plugin registers for the worker, and the request the
// migration step makes for the readings the former queue held (B4-R08).
export {
  endFailedCvTextReading,
  readCvText,
  requestUnfinishedCvTextReadings,
} from './extract-cv-text.ts'
export {
  cvTextReadingJob,
  type CvTextReading,
} from './infrastructure/worker/cv-text-queue.ts'
