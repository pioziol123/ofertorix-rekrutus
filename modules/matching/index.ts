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
export { readAssessmentExchange } from './read-assessment-exchange.ts'
export {
  manualContext,
  RatingConflict,
  readWeights,
  saveManualRating,
  saveWeights,
} from './ratings.ts'

// Composition: the receiver of Matching's assignments, which the shared
// registration of receivers registers under the settings name, and the end
// of assessments of the old way, which the migration step calls at the
// deployment of assignments (T10-R02).
export {
  assessmentAssignmentReceiver,
  assessmentSettingsKey,
} from './infrastructure/adapters/assessment-ai.ts'
export { failAssessmentsOfOldWay } from './fail-assessments-of-old-way.ts'
