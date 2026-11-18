/**
 * Public operations of the Matching module (match assessments of ads
 * against the confirmed professional profile). The module is still moving
 * here from lib/matching (task oferty-pracy-0mq.12); this entry point holds
 * what other parts already use from the new place.
 */

// Composition: where the worker registers the receiver of assessment
// outcomes.
export {
  assessmentReceiver,
  assessmentSettingsKey,
} from './infrastructure/adapters/assessment-ai.ts'
