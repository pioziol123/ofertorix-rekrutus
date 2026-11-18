import {
  activeProfileVersion,
  adsForAssessment,
  profileVersionNumbers,
  readRatings,
  withAdVersionState,
  withProfileNumbers,
} from './ratings.ts'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import {
  AiRequestError,
  readLatestExecution,
  readLatestExecutions,
  type ExecutionCheck,
} from '../../modules/ai/index.ts'
import { db, transaction } from '../db.ts'
import type { ProfileVersion } from '../../modules/profile/index.ts'
import type { SourceAd } from '../../modules/sources/index.ts'
import {
  matchingInput,
  type MatchingInput,
  type Assessment,
  type Criterion,
  type calculate,
} from './model.ts'
import {
  assessmentReservation,
  assessmentsConfigured,
  checkAssessmentExecution,
  maxCriteria,
  requestAssessment,
} from '../../modules/matching/infrastructure/adapters/assessment-ai.ts'
import { assessmentState } from '../../modules/matching/domain/assessment-state.ts'
import { matchingPending, type MatchingState } from './view.ts'
export class MatchingError extends Error {}

/** The configuration error the owner sees; the message predates AI. */
export const notConfiguredMessage =
  'Skonfiguruj model i cennik przed oceną ofert.'

/** What a request refused by AI means to the owner. */
export function refusalMessage(error: AiRequestError): string {
  if (error.code === 'provider_unavailable')
    return 'Model jest teraz niedostępny. Spróbuj ponownie później.'
  if (error.code === 'input_too_large')
    return 'Wejście przekracza skonfigurowany limit tokenów. Zmień zaznaczenie lub skróć profil.'
  return notConfiguredMessage
}

/** A prepared request: an existing one in progress, or a new one. */
export type PreparedRequest = {
  id: string
  state: MatchingState
  reused: boolean
  /** The input of a new request that still needs its AI work requested. */
  toRequest: MatchingInput | null
}

/**
 * Prepares the assessment request of an ad in the caller's transaction:
 * the ad's request whose AI work is still in progress, or a new request
 * with the input fixed from the given profile version and ad version. A
 * request whose required conditions conflict is excluded and needs no AI
 * work. Requests of one ad are prepared one at a time (a transaction lock),
 * so an ad has at most one request in progress.
 */
export async function prepareMatching(
  adId: string,
  // The active version read before the transaction; one read per enqueue, so a
  // group uses one version for all its offers.
  profile: ProfileVersion | null,
  // The ad read before the transaction, without a lock (see
  // adsForAssessment); undefined when it does not exist.
  ad: SourceAd | undefined,
): Promise<PreparedRequest> {
  const client = db()
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `matching-enqueue-${adId}`,
  ])
  const previous = (
    await client.query<{ id: string }>(
      "SELECT id FROM matching_requests WHERE ad_id=$1 AND state='requested' ORDER BY created_at DESC,id DESC LIMIT 1",
      [adId],
    )
  ).rows[0]
  if (previous) {
    const execution = await readLatestExecution(previous.id)
    const state = assessmentState('requested', execution)
    if (execution && matchingPending.some((pending) => pending === state))
      return {
        id: previous.id,
        state,
        reused: true,
        toRequest: null,
      }
  }
  if (!profile) throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
  if (!ad) throw new MatchingError('Nie znaleziono oferty.')
  const input = matchingInput(profile.data, ad)
  if (input.criteria.length > maxCriteria)
    throw new MatchingError(
      'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.',
    )
  const id = randomUUID()
  const excluded = input.checks.some((c) => c.state === 'conflict')
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-1): a request keeps only Matching's
  // state; the AI work keeps the settings and prices, so the request
  // stores none and no provider payload.
  await client.query(
    `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state) VALUES($1,$2,$3,$4,$5,'{}',$6)`,
    [
      id,
      adId,
      ad.versionId,
      profile.id,
      input,
      excluded ? 'excluded' : 'requested',
    ],
  )
  return excluded
    ? { id, state: 'excluded', reused: false, toRequest: null }
    : { id, state: 'queued', reused: false, toRequest: input }
}

/** Links a request to the execution AI accepted for it. */
export async function linkExecution(requestId: string, executionId: string) {
  await db().query('UPDATE matching_requests SET execution_id=$2 WHERE id=$1', [
    requestId,
    executionId,
  ])
}

/**
 * Requests the assessment of one offer as a single AI execution. An
 * assessment of the offer still in progress is reused.
 */
export async function enqueueMatching(adId: string) {
  if (!assessmentsConfigured()) throw new MatchingError(notConfiguredMessage)
  const profile = await activeProfileVersion()
  const ad = (await adsForAssessment([adId])).get(adId)
  let check: ExecutionCheck
  try {
    check = await checkAssessmentExecution()
  } catch (error) {
    if (error instanceof AiRequestError)
      throw new MatchingError(refusalMessage(error))
    throw error
  }
  try {
    return await transaction(async () => {
      const prepared = await prepareMatching(adId, profile, ad)
      if (!prepared.toRequest)
        return {
          id: prepared.id,
          state: prepared.state,
          reused: prepared.reused,
        }
      const requested = await requestAssessment(
        prepared.id,
        prepared.toRequest,
        check,
      )
      await linkExecution(prepared.id, requested.executionId)
      return { id: prepared.id, state: requested.state, reused: false }
    })
  } catch (error) {
    if (error instanceof AiRequestError)
      throw new MatchingError(refusalMessage(error))
    throw error
  }
}

export type MatchingHistory = {
  id: string
  state: MatchingState
  result: Assessment | null
  calculation: ReturnType<typeof calculate> | null
  error: string | null
  created_at: Date
  updated_at: Date
  profile_version_id: string
  profile_number: number
  offer_version_at: Date
  ad_revision_id: string
  checks: MatchingInput['checks']
  criteria: Criterion[]
  /**
   * The cost of the request's latest AI work, from the AI read: reserved,
   * and settled (null while it is not settled). Null for an excluded
   * request.
   */
  cost: { reserved: string; actual: string | null } | null
  stale: boolean
}
export async function readMatching(pool: Pool, adId: string) {
  const activeId = (await activeProfileVersion())?.id ?? null
  const rows = (
    await pool.query<{
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
      criteria: Criterion[]
    }>(
      `SELECT r.id,r.state,r.result,r.calculation,r.error,r.created_at,r.updated_at,r.profile_version_id,r.ad_revision_id,r.input->'checks' AS checks,r.input->'criteria' AS criteria
    FROM matching_requests r WHERE r.ad_id=$1 ORDER BY r.created_at DESC,r.id DESC`,
      [adId],
    )
  ).rows
  const executions = new Map(
    (
      await readLatestExecutions(
        rows.filter((row) => row.state !== 'excluded').map((row) => row.id),
      )
    ).map((execution) => [execution.operationId, execution]),
  )
  const requests = await withAdVersionState(
    rows.map((row) => {
      const execution = executions.get(row.id) ?? null
      return {
        ...row,
        state: assessmentState(row.state, execution),
        cost: execution ? execution.cost : null,
      }
    }),
    adId,
    activeId,
  )
  const numbers = await profileVersionNumbers(
    requests.map((row) => row.profile_version_id),
  )
  const history: MatchingHistory[] = withProfileNumbers(requests, numbers)
  return {
    configured: assessmentsConfigured(),
    profileReady: activeId !== null,
    maximumCostPln: assessmentReservation('single'),
    history,
    ...(await readRatings(pool, adId, activeId)),
  }
}
