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

/**
 * Takes the turn of an ad until the caller's transaction ends, so the
 * requests of one ad are prepared one at a time and an ad has at most one
 * assessment in progress.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-1): with the stage in AI, this lock
 * alone holds the rule the dropped index matching_one_pending held.
 */
export async function lockAdRequests(adId: string) {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `matching-enqueue-${adId}`,
  ])
}

/** The ad's latest request that asked AI for work, or null. */
export async function latestRequestedOfAd(
  adId: string,
): Promise<{ id: string } | null> {
  return (
    (
      await db().query<{ id: string }>(
        "SELECT id FROM matching_requests WHERE ad_id=$1 AND state='requested' ORDER BY created_at DESC,id DESC LIMIT 1",
        [adId],
      )
    ).rows[0] ?? null
  )
}

/**
 * Saves a new request with the input fixed from a profile version and an
 * ad version.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-1): a request keeps only Matching's
 * state; the AI work keeps the settings and prices, so the request stores
 * none and no provider payload.
 */
export async function insertAssessmentRequest(request: {
  id: string
  adId: string
  adRevisionId: string
  profileVersionId: string
  input: MatchingInput
  state: 'requested' | 'excluded'
}) {
  await db().query(
    `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state) VALUES($1,$2,$3,$4,$5,'{}',$6)`,
    [
      request.id,
      request.adId,
      request.adRevisionId,
      request.profileVersionId,
      request.input,
      request.state,
    ],
  )
}

/** Links a request to the execution AI accepted for it. */
export async function linkExecution(requestId: string, executionId: string) {
  await db().query('UPDATE matching_requests SET execution_id=$2 WHERE id=$1', [
    requestId,
    executionId,
  ])
}

/** The ads of the given requests, by request. */
export async function adsOfRequests(
  ids: string[],
): Promise<{ id: string; ad_id: string }[]> {
  return (
    await db().query<{ id: string; ad_id: string }>(
      'SELECT id,ad_id FROM matching_requests WHERE id=ANY($1::uuid[]) ORDER BY id',
      [ids],
    )
  ).rows
}

export type AssessmentHistoryRow = {
  id: string
  state: string
  result: Assessment | null
  calculation: ReturnType<typeof calculate> | null
  error: string | null
  created_at: Date
  updated_at: Date
  profile_version_id: string
  ad_revision_id: string
  checks: MatchingInput['checks']
  criteria: MatchingInput['criteria']
}

/** Every request of an ad, newest first. */
export async function requestHistoryOfAd(
  adId: string,
): Promise<AssessmentHistoryRow[]> {
  return (
    await db().query<AssessmentHistoryRow>(
      `SELECT r.id,r.state,r.result,r.calculation,r.error,r.created_at,r.updated_at,r.profile_version_id,r.ad_revision_id,r.input->'checks' AS checks,r.input->'criteria' AS criteria
       FROM matching_requests r WHERE r.ad_id=$1 ORDER BY r.created_at DESC,r.id DESC`,
      [adId],
    )
  ).rows
}

/**
 * The saved provider payloads of requests sent before the batch archive
 * kept inputs: the request itself or the members of its former group.
 */
export async function legacyPayloads(
  archiveId: string,
): Promise<{ id: string; request_payload: unknown }[]> {
  return (
    await db().query<{ id: string; request_payload: unknown }>(
      'SELECT id,request_payload FROM matching_requests WHERE (id=$1 OR group_id=$1) AND request_payload IS NOT NULL ORDER BY id',
      [archiveId],
    )
  ).rows
}

/** Whether the request exists. */
export async function requestExists(id: string): Promise<boolean> {
  return (
    ((await db().query('SELECT 1 FROM matching_requests WHERE id=$1', [id]))
      .rowCount ?? 0) > 0
  )
}

/**
 * Takes the turn of a group command until the caller's transaction ends,
 * so the same command is handled once at a time.
 */
export async function lockCommand(commandId: string) {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `matching-command-${commandId}`,
  ])
}

/** Every request of an ad, newest first, with its state and time. */
export async function requestsOfAd(
  adId: string,
): Promise<
  { id: string; state: 'requested' | 'excluded'; created_at: Date }[]
> {
  return (
    await db().query<{
      id: string
      state: 'requested' | 'excluded'
      created_at: Date
    }>(
      'SELECT id,state,created_at FROM matching_requests WHERE ad_id=$1 ORDER BY created_at DESC,id DESC',
      [adId],
    )
  ).rows
}
