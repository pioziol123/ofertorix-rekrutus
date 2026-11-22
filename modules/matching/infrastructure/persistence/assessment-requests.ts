import { db } from '../../../../lib/db.ts'
import type {
  Assessment,
  MatchingInput,
  calculate,
} from '../../domain/assessment.ts'

/**
 * Matching's assessment requests. A request keeps its own state only:
 * `excluded` (a required condition conflicts, nothing was requested) or
 * `requested` (AI work was requested; its outcome is the saved assessment
 * or message).
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-1): the two values of the state.
 */

/**
 * The condition of a request the offer's history and list show, on the
 * request alias `r` and the query parameter `message` holding the
 * message of an assessment the deployment ended (T10-R08): every request with an
 * assignment and every excluded one, which never reached AI; a request of
 * the old way, made before the deployment of assignments, only with a
 * saved assessment, or when the deployment ended it as failed (T10-R02),
 * which saved that message. Earlier AI work that ended without an
 * assessment is not shown.
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-1): that message, which nothing else
 * writes, tells a request the deployment ended from one that ended before
 * it.
 */
export const shownRequest = (r: string, message: string) =>
  `(${r}.assignment_id IS NOT NULL OR ${r}.state='excluded' OR ${r}.result IS NOT NULL OR ${r}.error=${message})`

export type AssessmentRequest = {
  id: string
  ad_id: string
  profile_version_id: string
  ad_revision_id: string
  input: MatchingInput
  state: 'requested' | 'excluded'
}

/**
 * The request of an assignment, locked until the caller's transaction ends,
 * with whether its outcome is already saved; null when no request keeps the
 * assignment.
 */
export async function lockAssignmentRequest(
  assignmentId: string,
): Promise<(AssessmentRequest & { ended: boolean }) | null> {
  return (
    (
      await db().query<AssessmentRequest & { ended: boolean }>(
        `SELECT id,ad_id,profile_version_id,ad_revision_id,input,state,
          (result IS NOT NULL OR error IS NOT NULL) AS ended
         FROM matching_requests WHERE assignment_id=$1 FOR UPDATE`,
        [assignmentId],
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

/**
 * The ad's latest request that asked AI for work, or null: with its
 * assignment, when it has one, and whether its outcome is saved.
 */
export async function latestRequestedOfAd(
  adId: string,
): Promise<RequestProgress | null> {
  return (
    (
      await db().query<RequestProgress>(
        `SELECT id,assignment_id,(result IS NOT NULL OR error IS NOT NULL) AS ended
         FROM matching_requests WHERE ad_id=$1 AND state='requested'
         ORDER BY created_at DESC,id DESC LIMIT 1`,
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

/** What tells whether a request's AI work is still in progress. */
export type RequestProgress = {
  id: string
  /** The assignment placed for it; null for AI work of the old way. */
  assignment_id: string | null
  /** Whether its outcome, an assessment or a message, is saved. */
  ended: boolean
}

/** Keeps with a request the assignment placed for it. */
export async function linkAssignment(requestId: string, assignmentId: string) {
  await db().query(
    'UPDATE matching_requests SET assignment_id=$2 WHERE id=$1',
    [requestId, assignmentId],
  )
}

/**
 * The assignments of the given ads' assessments whose outcome is not saved
 * yet: the assessment of an ad is its latest request, as the offer list
 * shows it. For the status read that keeps the list refreshing.
 */
export async function assignmentsWithoutOutcome(
  adIds: readonly string[],
): Promise<string[]> {
  if (!adIds.length) return []
  return (
    await db().query<{ assignment_id: string }>(
      `SELECT l.assignment_id FROM unnest($1::uuid[]) AS a(id)
       JOIN LATERAL (SELECT assignment_id,result,error FROM matching_requests
         WHERE ad_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) l ON true
       WHERE l.assignment_id IS NOT NULL AND l.result IS NULL AND l.error IS NULL`,
      [adIds],
    )
  ).rows.map((row) => row.assignment_id)
}

export type AssessmentHistoryRow = {
  id: string
  state: string
  assignment_id: string | null
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

/**
 * Every request of an ad its history shows, newest first;
 * `deploymentMessage` is the message of an assessment the deployment
 * ended (see `shownRequest`).
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-1)
 */
export async function requestHistoryOfAd(
  adId: string,
  deploymentMessage: string,
): Promise<AssessmentHistoryRow[]> {
  return (
    await db().query<AssessmentHistoryRow>(
      `SELECT r.id,r.state,r.assignment_id,r.result,r.calculation,r.error,r.created_at,r.updated_at,r.profile_version_id,r.ad_revision_id,r.input->'checks' AS checks,r.input->'criteria' AS criteria
       FROM matching_requests r WHERE r.ad_id=$1 AND ${shownRequest('r', '$2')}
       ORDER BY r.created_at DESC,r.id DESC`,
      [adId, deploymentMessage],
    )
  ).rows
}

/**
 * Whether the request exists, with the assignment placed for it (null for
 * an excluded request and for one made before the deployment of
 * assignments); null for an unknown request.
 */
export async function requestAssignment(
  id: string,
): Promise<{ assignmentId: string | null } | null> {
  const row = (
    await db().query<{ assignment_id: string | null }>(
      'SELECT assignment_id FROM matching_requests WHERE id=$1',
      [id],
    )
  ).rows[0]
  return row ? { assignmentId: row.assignment_id } : null
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

/** What a group command shows of a request saved for it. */
export type CommandRequest = {
  id: string
  ad_id: string
  created_at: Date
  /** Whether its assessment is saved. */
  assessed: boolean
  /** Whether its outcome, an assessment or a message, is saved. */
  ended: boolean
}

const commandRequestColumns = `r.id,r.ad_id,r.created_at,
  (r.result IS NOT NULL) AS assessed,
  (r.result IS NOT NULL OR r.error IS NOT NULL) AS ended`

/**
 * The requests with the given identifiers that asked AI for work.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): serves the interim recognition of
 * a repeated group command.
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-1): the identifiers a command gives
 * the requests it saves.
 */
export async function requestedWithIds(
  ids: string[],
): Promise<CommandRequest[]> {
  return (
    await db().query<CommandRequest>(
      `SELECT ${commandRequestColumns} FROM matching_requests r
       WHERE r.id=ANY($1::uuid[]) AND r.state='requested'
       ORDER BY r.id`,
      [ids],
    )
  ).rows
}

/**
 * The requests that asked AI for work, saved in the same transaction as
 * the given one (a transaction saves every row with its start time), with
 * that moment.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): serves the interim recognition of
 * a repeated group command.
 */
export async function requestedWith(
  requestId: string,
): Promise<CommandRequest[]> {
  return (
    await db().query<CommandRequest>(
      `SELECT ${commandRequestColumns} FROM matching_requests r
       JOIN matching_requests o ON o.id=$1 AND r.created_at=o.created_at
       WHERE r.state='requested'`,
      [requestId],
    )
  ).rows
}

/**
 * Every request of an ad, newest first, with its state and time, and for
 * one with an assignment whether and when its outcome was saved.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): serves the interim recognition of
 * a repeated group command (itemOutsideGroup).
 */
export async function requestsOfAd(adId: string): Promise<
  (Omit<CommandRequest, 'ad_id'> & {
    state: 'requested' | 'excluded'
    assignment_id: string | null
    updated_at: Date
  })[]
> {
  return (
    await db().query(
      `SELECT r.id,r.state,r.created_at,r.updated_at,r.assignment_id,
        (r.result IS NOT NULL) AS assessed,
        (r.result IS NOT NULL OR r.error IS NOT NULL) AS ended
       FROM matching_requests r WHERE r.ad_id=$1
       ORDER BY r.created_at DESC,r.id DESC`,
      [adId],
    )
  ).rows
}

/**
 * Ends with the message every request still waiting for AI work without
 * an assignment: one that requested AI work and has no saved outcome;
 * returns how many. A request with an assignment is left to its receiver.
 */
export async function endRequestsWithoutAssignment(
  message: string,
): Promise<number> {
  const ended = await db().query(
    `UPDATE matching_requests SET error=$1,updated_at=now()
     WHERE state='requested' AND assignment_id IS NULL
       AND result IS NULL AND error IS NULL`,
    [message],
  )
  return ended.rowCount ?? 0
}
