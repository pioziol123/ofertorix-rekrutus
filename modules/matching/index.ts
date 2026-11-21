/**
 * Public operations of the Matching module (match assessments of ads
 * against the confirmed professional profile). Routes, the worker and other
 * modules use only these; views use `view.ts`.
 */
export { enqueueMatching, MatchingError } from './request-assessment.ts'
export { enqueueMatchingGroup } from './request-assessment-group.ts'
export { readMatching, type MatchingHistory } from './read-assessments.ts'
export {
  decorateMatching,
  matchingListStatus,
} from './read-offer-assessments.ts'
export { readBatchArchive } from './read-assessment-archive.ts'
export {
  manualContext,
  RatingConflict,
  readWeights,
  saveManualRating,
  saveWeights,
} from './ratings.ts'

// Composition: the receiver of Matching's assignments, which the shared
// registration of receivers registers under the settings name, and the
// receiver of outcomes of the old way, which the AI module plugin registers
// until task oferty-pracy-sq2.11.
export {
  assessmentAssignmentReceiver,
  assessmentReceiver,
  assessmentSettingsKey,
} from './infrastructure/adapters/assessment-ai.ts'
