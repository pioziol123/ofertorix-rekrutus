import type { FinishedRunStatus } from './run-states.ts'

/**
 * The status a run finishes with, the same for every source (A5-R03):
 * complete when the source checked the whole scope and every batch was
 * saved, partial when it is not complete but saved at least one ad, failed
 * otherwise. A failed save never gives a complete run.
 */
export function finishedRunStatus(run: {
  /** The source reported the whole scope as checked. */
  sourceComplete: boolean
  /** Saving some batch of the run failed. */
  saveFailed: boolean
  /** Unique ads the run has saved. */
  uniqueAds: number
}): FinishedRunStatus {
  if (run.sourceComplete && !run.saveFailed) return 'complete'
  return run.uniqueAds > 0 ? 'partial' : 'failed'
}
