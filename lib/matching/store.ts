import {
  activeProfileVersion,
  adsForAssessment,
  currentAdVersions,
  profileVersionNumbers,
  publishAiRating,
  readRatings,
  withAdVersionState,
  withProfileNumbers,
} from './ratings.ts'
import { batchArchive } from './archive.ts'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import {
  aiConfiguration,
  type AiConfiguration,
} from '../../modules/ai/index.ts'
import { chargeCeiling, reserve } from '../../modules/ai/index.ts'
import { db, queueDatabase, transaction } from '../db.ts'
import type { ProfileVersion } from '../../modules/profile/index.ts'
import type { SourceAd } from '../../modules/sources/index.ts'
import { requireQueued } from '../queue.ts'
import {
  matchingInput,
  AssessmentError,
  validateAssessment,
  calculate,
  type MatchingInput,
  type Assessment,
  type Criterion,
} from './model.ts'
import {
  batchRequest,
  BatchClient,
  BatchError,
  batchFailure,
  terminal,
  readBatchResponse,
  type Batch,
  type BatchLine,
} from './batch.ts'
export const matchingQueue = 'offer-matching'
export class MatchingError extends Error {}
export const matchingConfiguration = () => aiConfiguration('matching', 'batch')
const pending = [
  'waiting_budget',
  'queued',
  'uploading',
  'submitting',
  'submitted',
]
async function deliver(boss: PgBoss, id: string) {
  await requireQueued(
    boss.send(
      matchingQueue,
      { requestId: id },
      {
        db: queueDatabase,
        retryLimit: 0,
        expireInSeconds: 300,
      },
    ),
  )
}
/**
 * Reserves the budget of one request still waiting for it and marks it
 * queued. Runs in the caller's transaction; a request another run has
 * already funded is left as it is.
 */
export async function attempt(
  boss: PgBoss,
  id: string,
  config: AiConfiguration,
  dispatch = true,
) {
  if (!(await waitingForBudget(id))) return true
  const budget = await reserve(db(), config)
  if (!budget.enough) return false
  await fundAttempt(boss, id, config, budget, dispatch)
  return true
}
/** Takes a request that still waits for budget; false when another run funded it. */
export async function waitingForBudget(id: string) {
  return !!(
    await db().query(
      "SELECT id FROM matching_requests WHERE id=$1 AND state='waiting_budget' FOR UPDATE",
      [id],
    )
  ).rowCount
}
/** Records the attempt of a request taken by waitingForBudget, within its budget. */
export async function fundAttempt(
  boss: PgBoss,
  id: string,
  config: AiConfiguration,
  budget: { month: string; cost: string },
  dispatch = true,
) {
  const attemptId = randomUUID()
  await db().query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration) VALUES($1,NULL,0,$2,1,$3,'matching','queued',$4,$5)`,
    [attemptId, budget.month, id, budget.cost, config],
  )
  await db().query(
    "UPDATE matching_requests SET state='queued',attempt_id=$2,updated_at=now() WHERE id=$1",
    [id, attemptId],
  )
  if (dispatch) await deliver(boss, id)
}
export async function prepareMatching(
  boss: PgBoss,
  adId: string,
  config: AiConfiguration,
  // The active version read before the transaction; one read per enqueue, so a
  // group uses one version for all its offers.
  profile: ProfileVersion | null,
  // The ad read before the transaction, without a lock (see
  // adsForAssessment); undefined when it does not exist.
  ad: SourceAd | undefined,
  dispatch = true,
): Promise<{ id: string; state: string; reused: boolean }> {
  const client = db()
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `matching-enqueue-${adId}`,
  ])
  const previous = (
    await client.query(
      'SELECT id,state FROM matching_requests WHERE ad_id=$1 AND state=ANY($2::text[])',
      [adId, pending],
    )
  ).rows[0]
  if (previous) return { ...previous, reused: true }
  if (!profile) throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
  if (!ad) throw new MatchingError('Nie znaleziono oferty.')
  const input = matchingInput(profile.data, ad)
  const id = randomUUID()
  const excluded = input.checks.some((c) => c.state === 'conflict')
  const payload = excluded ? null : batchRequest(id, input, config).body
  await client.query(
    `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,request_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      adId,
      ad.versionId,
      profile.id,
      input,
      config,
      excluded ? 'excluded' : 'waiting_budget',
      payload,
    ],
  )
  await client.query('INSERT INTO matching_batches(request_id) VALUES($1)', [
    id,
  ])
  if (!excluded && dispatch) await attempt(boss, id, config)
  const row = (
    await client.query('SELECT id,state FROM matching_requests WHERE id=$1', [
      id,
    ])
  ).rows[0]
  return { ...row, reused: false }
}
export async function enqueueMatching(boss: PgBoss, adId: string) {
  const config = matchingConfiguration()
  if (!config)
    throw new MatchingError(
      'Skonfiguruj model i cennik Batch przed oceną ofert.',
    )
  const profile = await activeProfileVersion()
  const ad = (await adsForAssessment([adId])).get(adId)
  try {
    return await transaction(() =>
      prepareMatching(boss, adId, config, profile, ad),
    )
  } catch (e) {
    if (e instanceof BatchError && e.code === 'limit')
      throw new MatchingError(
        'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.',
      )
    throw e
  }
}
export async function settle(
  attemptId: string,
  cost: string | null,
  usage: unknown = null,
  responseId: string | null = null,
) {
  await db().query(
    'UPDATE ai_attempts SET state=$2,actual_pln=$3,usage=$4,response_id=$5,finished_at=now() WHERE id=$1',
    [attemptId, cost === null ? 'unknown' : 'settled', cost, usage, responseId],
  )
}
/**
 * Ends a request that is still in the state `from` with a failure and
 * settles its attempt. A request another run has moved on is left as it is.
 */
export async function finishFailure(
  id: string,
  attemptId: string | null,
  from: string,
  state: 'failed' | 'unknown',
  message: string,
  cost: string | null = null,
) {
  await transaction(async () => {
    const ended = await db().query(
      'UPDATE matching_requests SET state=$3,error=$4,updated_at=now() WHERE id=$1 AND state=$2',
      [id, from, state, message],
    )
    if (ended.rowCount && attemptId) await settle(attemptId, cost)
  })
}
/** Moves a request from one state to the next; false when another run moved it. */
async function advance(id: string, from: string, to: string) {
  return !!(
    await db().query(
      'UPDATE matching_requests SET state=$3,updated_at=now() WHERE id=$1 AND state=$2',
      [id, from, to],
    )
  ).rowCount
}
export type MatchingRecord = {
  id: string
  attempt_id: string
  configuration: AiConfiguration
  input: MatchingInput
  ad_id: string
  profile_version_id: string
  ad_revision_id: string
}
export async function applyMatchingLine(
  row: MatchingRecord,
  line: BatchLine | undefined,
  batch: Batch,
  // Read by the caller before it started, without a lock: a version
  // confirmed since then is the accepted race of 0mq.13 and shows as a
  // stale rating; the owner can enqueue it again.
  activeProfileVersionId: string | null,
  // The current version of the request's ad, read the same way; an ad
  // changed since then is the same accepted race.
  currentAdVersionId: string | undefined,
) {
  if (!line || line.error || line.response?.status_code !== 200) {
    const noCharge =
      (!line &&
        batch.status === 'failed' &&
        !batch.output_file_id &&
        !batch.error_file_id) ||
      line?.error?.code === 'batch_expired'
    await finishFailure(
      row.id,
      row.attempt_id,
      'submitted',
      'failed',
      'Batch nie dostarczył oceny. Poprzednie wyniki pozostały bez zmian.',
      noCharge ? '0' : null,
    )
  } else {
    let diagnostic = 'response_format'
    let cost: string | null = null
    let usage: unknown = null
    let responseId: string | null = null
    let result: ReturnType<typeof validateAssessment> | null = null
    let calculation: ReturnType<typeof calculate> | null = null
    try {
      const response = readBatchResponse(line)
      usage = response.usage
      responseId = response.id
      const config: AiConfiguration = row.configuration
      if (
        response.usage.input_tokens <= config.maxInputTokens &&
        response.usage.output_tokens <= config.maxOutputTokens
      )
        cost = chargeCeiling(
          config,
          response.usage.input_tokens,
          response.usage.output_tokens,
        )
      if (response.diagnostic) {
        diagnostic = response.diagnostic
        throw new Error('Rejected response')
      }
      diagnostic = 'assessment_unknown'
      result = validateAssessment(
        response.assessment,
        row.input as MatchingInput,
      )
      calculation = calculate(result, row.input)
    } catch (error) {
      if (error instanceof AssessmentError) diagnostic = error.code
      /* Keep usage settlement even if content failed validation. */
    }
    await transaction(async () => {
      // Only the run that takes the submitted request settles and publishes it.
      const taken = (
        await db().query(
          "SELECT id FROM matching_requests WHERE id=$1 AND state='submitted' FOR UPDATE",
          [row.id],
        )
      ).rowCount
      if (!taken) return
      await settle(row.attempt_id, cost, usage, responseId)
      if (result)
        calculation = (
          await publishAiRating(
            row,
            result,
            activeProfileVersionId,
            currentAdVersionId,
          )
        ).calculation
      await db().query(
        'UPDATE matching_requests SET state=$2,result=$3,calculation=$4,error=$5,updated_at=now() WHERE id=$1',
        [
          row.id,
          result ? 'completed' : 'failed',
          result,
          calculation,
          result
            ? null
            : `Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: ${diagnostic}]`,
        ],
      )
    })
  }
}
/**
 * Carries a single request one step further: funds it, sends it, polls its
 * batch, applies the result and cleans up the files. It holds no
 * connection between steps. Each step changes the request's state only
 * from the state it read, so a second run of the same request does not
 * send it twice or settle it twice.
 */
export async function executeMatching(
  boss: PgBoss,
  id: string,
  provider?: BatchClient,
) {
  // Read before the run starts; the reads take no lock (see applyMatchingLine).
  const activeProfileVersionId = (await activeProfileVersion())?.id ?? null
  const adVersions = await currentAdVersions(
    (
      await db().query<{ ad_id: string }>(
        'SELECT ad_id FROM matching_requests WHERE id=$1',
        [id],
      )
    ).rows.map((request) => request.ad_id),
  )
  let row = (
    await db().query(
      'SELECT * FROM matching_requests WHERE id=$1 AND group_id IS NULL',
      [id],
    )
  ).rows[0]
  if (!row) return
  if (row.state === 'waiting_budget') {
    await transaction(() => attempt(boss, id, row.configuration))
    return
  }
  // A request in sending belongs to the run sending it: another run leaves
  // it alone. Detecting interrupted sending belongs to task
  // oferty-pracy-0mq.15 (owner's decision in A13).
  if (row.state === 'uploading' || row.state === 'submitting') return
  const api =
    provider ??
    new BatchClient(
      process.env.OPENAI_API_KEY ?? '',
      fetch,
      batchArchive(db(), id),
    )
  if (row.state === 'queued') {
    const request = {
      custom_id: id,
      method: 'POST',
      url: '/v1/responses',
      body: row.request_payload,
    } as ReturnType<typeof batchRequest>
    if (!request.body) {
      await finishFailure(
        id,
        row.attempt_id,
        'queued',
        'failed',
        'Brak zapisanej wersji żądania. Nie zlecono analizy.',
        '0',
      )
      return
    }
    if (!(await advance(id, 'queued', 'uploading'))) return
    await db().query("UPDATE ai_attempts SET state='running' WHERE id=$1", [
      row.attempt_id,
    ])
    let file: string
    try {
      file = await api.upload([request])
    } catch (e) {
      await finishFailure(
        id,
        row.attempt_id,
        'uploading',
        'failed',
        batchFailure(
          'Nie udało się przesłać pliku Batch. Nie zlecono analizy.',
          e,
        ),
        '0',
      )
      return
    }
    await db().query(
      'UPDATE matching_batches SET input_file_id=$2 WHERE request_id=$1',
      [id, file],
    )
    if (!(await advance(id, 'uploading', 'submitting'))) return
    try {
      const batch = await api.create(file, id)
      if (batch.input_file_id !== file) throw new BatchError('format')
      const submitted = await transaction(async () => {
        if (!(await advance(id, 'submitting', 'submitted'))) return false
        await db().query(
          'UPDATE matching_batches SET batch_id=$2,status=$3,polled_at=now() WHERE request_id=$1',
          [id, batch.id, batch.status],
        )
        return true
      })
      if (!submitted) return
    } catch (e) {
      const rejected =
        e instanceof BatchError &&
        e.code === 'http' &&
        e.status !== null &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408
      await finishFailure(
        id,
        row.attempt_id,
        'submitting',
        rejected ? 'failed' : 'unknown',
        batchFailure(
          'Nie udało się potwierdzić utworzenia partii. Nie ponowiono automatycznie.',
          e,
        ),
        rejected ? '0' : null,
      )
      return
    }
    row = { ...row, state: 'submitted' }
  }
  const batchRow = (
    await db().query('SELECT * FROM matching_batches WHERE request_id=$1', [id])
  ).rows[0]
  if (row.state === 'submitted') {
    await db().query(
      'UPDATE matching_batches SET polled_at=now() WHERE request_id=$1',
      [id],
    )
    let batch
    try {
      batch = await api.retrieve(batchRow.batch_id)
      if (batch.input_file_id !== batchRow.input_file_id)
        throw new BatchError('format')
    } catch (e) {
      await db().query(
        'UPDATE matching_requests SET error=$2,updated_at=now() WHERE id=$1',
        [
          id,
          batchFailure(
            'Nie udało się sprawdzić partii. Odczyt zostanie wznowiony.',
            e,
          ),
        ],
      )
      return
    }
    await db().query(
      'UPDATE matching_batches SET status=$2,output_file_id=$3,error_file_id=$4 WHERE request_id=$1',
      [
        id,
        batch.status,
        batch.output_file_id ?? null,
        batch.error_file_id ?? null,
      ],
    )
    if (!terminal(batch)) return
    let results
    try {
      results = await api.results(batch, [id])
    } catch (error) {
      if (
        error instanceof BatchError &&
        (error.code === 'format' ||
          error.code === 'limit' ||
          error.status === 404)
      ) {
        await finishFailure(
          id,
          row.attempt_id,
          'submitted',
          'failed',
          batchFailure(
            'Nieprawidłowy lub niedostępny plik wyników Batch. Koszt wymaga sprawdzenia.',
            error,
          ),
        )
        return
      }
      // A transient download failure remains retryable, including terminal batches.
      await db().query('UPDATE matching_requests SET error=$2 WHERE id=$1', [
        id,
        batchFailure(
          'Odbiór wyników nie powiódł się; odczyt zostanie wznowiony.',
          error,
        ),
      ])
      return
    }
    await applyMatchingLine(
      row,
      results.get(id),
      batch,
      activeProfileVersionId,
      adVersions.get(row.ad_id),
    )
  }
  // Cleanup is independent of result validity and never resubmits a request.
  const cleanup = (
    await db().query(
      'SELECT b.*,r.state FROM matching_batches b JOIN matching_requests r ON r.id=b.request_id WHERE request_id=$1',
      [id],
    )
  ).rows[0]
  if (!cleanup.cleaned && ['completed', 'failed'].includes(cleanup.state)) {
    try {
      for (const file of new Set(
        [
          cleanup.input_file_id,
          cleanup.output_file_id,
          cleanup.error_file_id,
        ].filter(Boolean),
      ))
        await api.remove(file)
      await db().query(
        'UPDATE matching_batches SET cleaned=true WHERE request_id=$1',
        [id],
      )
    } catch {
      /* Recovery retries file cleanup, not evaluation. */
    }
  }
}
export async function recoverMatching(pool: Pool, boss: PgBoss) {
  const rows = await pool.query(
    `SELECT r.id FROM matching_requests r JOIN matching_batches b ON b.request_id=r.id WHERE r.group_id IS NULL AND (r.state=ANY($1::text[]) OR (r.state IN ('completed','failed') AND NOT b.cleaned))`,
    [pending],
  )
  for (const row of rows.rows)
    await boss.send(
      matchingQueue,
      { requestId: row.id },
      {
        singletonKey: row.id,
        singletonSeconds: 60,
        retryLimit: 0,
        expireInSeconds: 300,
      },
    )
}
export type MatchingHistory = {
  id: string
  state: string
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
  batch_id: string | null
  batch_status: string | null
  cleaned: boolean
  stale: boolean
}
export async function readMatching(pool: Pool, adId: string) {
  const activeId = (await activeProfileVersion())?.id ?? null
  const requests = await withAdVersionState(
    (
      await pool.query<
        Omit<MatchingHistory, 'profile_number' | 'offer_version_at' | 'stale'>
      >(
        `SELECT r.id,r.state,r.result,r.calculation,r.error,r.created_at,r.updated_at,r.profile_version_id,r.ad_revision_id,r.input->'checks' AS checks,r.input->'criteria' AS criteria,coalesce(g.batch_id,b.batch_id) AS batch_id,coalesce(g.status,b.status) AS batch_status,coalesce(g.cleaned,b.cleaned) AS cleaned
    FROM matching_requests r LEFT JOIN matching_batches b ON b.request_id=r.id LEFT JOIN matching_groups g ON g.id=r.group_id WHERE r.ad_id=$1 ORDER BY r.created_at DESC,r.id DESC`,
        [adId],
      )
    ).rows,
    adId,
    activeId,
  )
  const numbers = await profileVersionNumbers(
    requests.map((row) => row.profile_version_id),
  )
  const config = matchingConfiguration()
  return {
    configured: config !== null,
    profileReady: activeId !== null,
    maximumCostPln: config
      ? chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens)
      : null,
    history: withProfileNumbers(requests, numbers),
    ...(await readRatings(pool, adId, activeId)),
  }
}
