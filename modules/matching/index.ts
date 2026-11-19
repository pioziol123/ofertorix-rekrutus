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

// Composition: where the worker registers the receiver of assessment
// outcomes.
export {
  assessmentReceiver,
  assessmentSettingsKey,
} from './infrastructure/adapters/assessment-ai.ts'
