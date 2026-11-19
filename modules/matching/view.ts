/**
 * Public entry of the Matching module for views. Views run in the browser,
 * so this entry reaches no server code: no database, queue or Node
 * built-ins. Server code uses `index.ts`.
 */
export {
  matchingCriterionLabel,
  matchingGroupLabels,
  matchingPending,
  matchingStateLabels,
  type MatchingState,
  type MatchingSummary,
} from './domain/assessment-view.ts'
export type { Assessment } from './domain/assessment.ts'
export { weightsSchema, type Weights } from './domain/weights.ts'
