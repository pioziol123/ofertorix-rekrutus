/**
 * Public operations of the Profile module (the owner's professional
 * profile). Other modules and entry points use only these.
 */
export {
  readActiveProfileVersion,
  readProfileVersionMetadata,
  readProfileVersions,
  type ActiveProfileVersion,
  type ProfileVersion,
  type ProfileVersionMetadata,
} from './read-confirmed-versions.ts'
export type { ProfileData } from '../../lib/profile/model.ts'
export { prepareProposal, type PreparationRequest } from './prepare-proposal.ts'
export {
  listImports,
  proposalAiConfigured,
  readImport,
} from './read-imports.ts'

// Composition: where the worker registers the receiver of proposal outcomes.
export {
  proposalReceiver,
  proposalSettingsKey,
} from './infrastructure/adapters/proposal-ai.ts'
