import { db } from '../../../../lib/db.ts'
import type {
  Assessment,
  MatchingInput,
  calculate,
} from '../../../../lib/matching/model.ts'

/**
 * Matching's assessment requests. A request keeps its own state only:
 * `excluded` (a required condition conflicts, nothing was requested) or
 * `requested` (the stage of the AI work is read from its execution). The
 * request is the operation of its AI executions.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-1): the two values of the state.
 */

export type AssessmentRequest = {
  id: string
  ad_id: string
  profile_version_id: string
  ad_revision_id: string
  input: MatchingInput
  state: 'requested' | 'excluded'
}

/**
 * The request, locked until the caller's transaction ends, so that two
 * deliveries of its result take it over one after the other.
 */
export async function lockAssessmentRequest(
  id: string,
): Promise<AssessmentRequest | null> {
  return (
    (
      await db().query<AssessmentRequest>(
        'SELECT id,ad_id,profile_version_id,ad_revision_id,input,state FROM matching_requests WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0] ?? null
  )
}

/** Saves what the AI work of a request ended with. */
export async function saveAssessmentOutcome(
  id: string,
  outcome: {
    result: Assessment | null
    calculation: ReturnType<typeof calculate> | null
    error: string | null
  },
) {
  await db().query(
    'UPDATE matching_requests SET result=$2,calculation=$3,error=$4,updated_at=now() WHERE id=$1',
    [id, outcome.result, outcome.calculation, outcome.error],
  )
}
