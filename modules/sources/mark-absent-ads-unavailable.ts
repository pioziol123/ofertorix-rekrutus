import { markAdsAbsentFromRunUnavailable } from './infrastructure/persistence/source-ads.ts'

/** A complete run and what its connector declares about absence. */
export type CompletedRunContext = {
  runId: string
  scopeId: string
  source: string
  /** The connector's declaration: absence from a complete run is evidence. */
  infersUnavailabilityFromAbsence: boolean
}

/**
 * Applies the unavailability rule after a complete run (F2-12, A7): the
 * source's ads observed in any run of the scope, but not in this run, become
 * unavailable. The scope's observation history decides membership, not the
 * scope an ad was last seen in. Returns how many ads it changed from
 * available to unavailable, 0 included (T2-R01, R02), or null when the
 * connector does not allow inference from absence and nothing is marked.
 * The caller runs it in the transaction that finishes the run as complete
 * and stores the count there, so the marking, the count and the status
 * commit together or not at all (T2-R06).
 */
export async function markAbsentAdsUnavailable(
  run: CompletedRunContext,
): Promise<number | null> {
  if (!run.infersUnavailabilityFromAbsence) return null
  return markAdsAbsentFromRunUnavailable(run)
}
