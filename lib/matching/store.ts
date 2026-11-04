import { publishAiRating, readRatings } from './ratings.ts'
import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { PgBoss } from 'pg-boss'
import {
  aiConfiguration,
  chargeCeiling,
  reserve,
  type AiConfiguration,
} from '../profile/ai.ts'
import { tx } from '../profile/store.ts'
import { profileSchema } from '../profile/model.ts'
import { projectOffer } from '../offers.ts'
import { requireQueued } from '../queue.ts'
import {
  matchingInput,
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
export const matchingConfiguration = () =>
  aiConfiguration('AI_MATCHING_PRICING_JSON')
const pending = [
  'waiting_budget',
  'queued',
  'uploading',
  'submitting',
  'submitted',
]
async function deliver(client: PoolClient, boss: PgBoss, id: string) {
  await requireQueued(
    boss.send(
      matchingQueue,
      { requestId: id },
      {
        db: { executeSql: (sql, values) => client.query(sql, values) },
        retryLimit: 0,
        expireInSeconds: 300,
      },
    ),
  )
}
export async function attempt(
  client: PoolClient,
  boss: PgBoss,
  id: string,
  config: AiConfiguration,
  dispatch = true,
) {
  const budget = await reserve(client, config)
  if (!budget.enough) return false
  const attemptId = randomUUID()
  await client.query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration) VALUES($1,NULL,0,$2,1,$3,'matching','queued',$4,$5)`,
    [attemptId, budget.month, id, budget.cost, config],
  )
  await client.query(
    "UPDATE matching_requests SET state='queued',attempt_id=$2,updated_at=now() WHERE id=$1",
    [id, attemptId],
  )
  if (dispatch) await deliver(client, boss, id)
  return true
}
export async function prepareMatching(
  client: PoolClient,
  boss: PgBoss,
  adId: string,
  config: AiConfiguration,
  suppliedProfile?: { id: string; data: unknown },
  dispatch = true,
): Promise<{ id: string; state: string; reused: boolean }> {
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
  const profile =
    suppliedProfile ??
    (
      await client.query(
        'SELECT v.* FROM profile_head h JOIN profile_versions v ON v.id=h.active_version_id WHERE h.singleton',
      )
    ).rows[0]
  if (!profile) throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
  const ad = (
    await client.query(
      'SELECT a.*,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id WHERE a.id=$1',
      [adId],
    )
  ).rows[0]
  if (!ad) throw new MatchingError('Nie znaleziono oferty.')
  const input = matchingInput(
    profileSchema.parse(profile.data),
    projectOffer(ad),
  )
  const id = randomUUID()
  const excluded = input.checks.some((c) => c.state === 'conflict')
  const payload = excluded ? null : batchRequest(id, input, config).body
  await client.query(
    `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,request_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      adId,
      ad.current_revision_id,
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
  if (!excluded && dispatch) await attempt(client, boss, id, config)
  const row = (
    await client.query('SELECT id,state FROM matching_requests WHERE id=$1', [
      id,
    ])
  ).rows[0]
  return { ...row, reused: false }
}
export async function enqueueMatching(pool: Pool, boss: PgBoss, adId: string) {
  const config = matchingConfiguration()
  if (!config)
    throw new MatchingError(
      'Skonfiguruj model i cennik Batch przed oceną ofert.',
    )
  const client = await pool.connect()
  try {
    return await tx(client, () => prepareMatching(client, boss, adId, config))
  } catch (e) {
    if (e instanceof BatchError && e.code === 'limit')
      throw new MatchingError(
        'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.',
      )
    throw e
  } finally {
    client.release()
  }
}
export async function settle(
  client: PoolClient,
  attemptId: string,
  cost: string | null,
  usage: unknown = null,
  responseId: string | null = null,
) {
  await client.query(
    'UPDATE ai_attempts SET state=$2,actual_pln=$3,usage=$4,response_id=$5,finished_at=now() WHERE id=$1',
    [attemptId, cost === null ? 'unknown' : 'settled', cost, usage, responseId],
  )
}
export async function finishFailure(
  client: PoolClient,
  id: string,
  attemptId: string | null,
  state: 'failed' | 'unknown',
  message: string,
  cost: string | null = null,
) {
  await tx(client, async () => {
    await client.query(
      'UPDATE matching_requests SET state=$2,error=$3,updated_at=now() WHERE id=$1',
      [id, state, message],
    )
    if (attemptId) await settle(client, attemptId, cost)
  })
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
  client: PoolClient,
  row: MatchingRecord,
  line: BatchLine | undefined,
  batch: Batch,
) {
  if (!line || line.error || line.response?.status_code !== 200) {
    const noCharge =
      (!line &&
        batch.status === 'failed' &&
        !batch.output_file_id &&
        !batch.error_file_id) ||
      line?.error?.code === 'batch_expired'
    await finishFailure(
      client,
      row.id,
      row.attempt_id,
      'failed',
      'Batch nie dostarczył oceny. Poprzednie wyniki pozostały bez zmian.',
      noCharge ? '0' : null,
    )
  } else {
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
      result = validateAssessment(
        response.assessment,
        row.input as MatchingInput,
      )
      calculation = calculate(result, row.input)
    } catch {
      /* Keep usage settlement even if content failed validation. */
    }
    await tx(client, async () => {
      await settle(client, row.attempt_id, cost, usage, responseId)
      if (result)
        calculation = (await publishAiRating(client, row, result)).calculation
      await client.query(
        'UPDATE matching_requests SET state=$2,result=$3,calculation=$4,error=$5,updated_at=now() WHERE id=$1',
        [
          row.id,
          result ? 'completed' : 'failed',
          result,
          calculation,
          result
            ? null
            : 'Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian.',
        ],
      )
    })
  }
}
export async function executeMatching(
  pool: Pool,
  boss: PgBoss,
  id: string,
  provider?: BatchClient,
) {
  const client = await pool.connect()
  try {
    const locked = (
      await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [`matching-${id}`],
      )
    ).rows[0].locked
    if (!locked) return
    try {
      let row = (
        await client.query(
          'SELECT * FROM matching_requests WHERE id=$1 AND group_id IS NULL',
          [id],
        )
      ).rows[0]
      if (!row) return
      if (row.state === 'waiting_budget') {
        await tx(client, () => attempt(client, boss, id, row.configuration))
        return
      }
      // A second worker cannot enter while a live submission holds this lock.
      if (row.state === 'uploading' || row.state === 'submitting') {
        await finishFailure(
          client,
          id,
          row.attempt_id,
          row.state === 'submitting' ? 'unknown' : 'failed',
          'Przerwano wysyłanie. Nie ponowiono automatycznie; sprawdź partię i koszt.',
          row.state === 'uploading' ? '0' : null,
        )
        return
      }
      const api = provider ?? new BatchClient(process.env.OPENAI_API_KEY ?? '')
      if (row.state === 'queued') {
        const request = {
          custom_id: id,
          method: 'POST',
          url: '/v1/responses',
          body: row.request_payload,
        } as ReturnType<typeof batchRequest>
        if (!request.body) {
          await finishFailure(
            client,
            id,
            row.attempt_id,
            'failed',
            'Brak zapisanej wersji żądania. Nie zlecono analizy.',
            '0',
          )
          return
        }
        await client.query(
          "UPDATE matching_requests SET state='uploading',updated_at=now() WHERE id=$1",
          [id],
        )
        await client.query(
          "UPDATE ai_attempts SET state='running' WHERE id=$1",
          [row.attempt_id],
        )
        let file: string
        try {
          file = await api.upload([request])
        } catch (e) {
          await finishFailure(
            client,
            id,
            row.attempt_id,
            'failed',
            batchFailure(
              'Nie udało się przesłać pliku Batch. Nie zlecono analizy.',
              e,
            ),
            '0',
          )
          return
        }
        await client.query(
          'UPDATE matching_batches SET input_file_id=$2 WHERE request_id=$1',
          [id, file],
        )
        await client.query(
          "UPDATE matching_requests SET state='submitting',updated_at=now() WHERE id=$1",
          [id],
        )
        try {
          const batch = await api.create(file, id)
          if (batch.input_file_id !== file) throw new BatchError('format')
          await tx(client, async () => {
            await client.query(
              'UPDATE matching_batches SET batch_id=$2,status=$3,polled_at=now() WHERE request_id=$1',
              [id, batch.id, batch.status],
            )
            await client.query(
              "UPDATE matching_requests SET state='submitted',updated_at=now() WHERE id=$1",
              [id],
            )
          })
        } catch (e) {
          const rejected =
            e instanceof BatchError &&
            e.code === 'http' &&
            e.status !== null &&
            e.status >= 400 &&
            e.status < 500 &&
            e.status !== 408
          await finishFailure(
            client,
            id,
            row.attempt_id,
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
        await client.query(
          'SELECT * FROM matching_batches WHERE request_id=$1',
          [id],
        )
      ).rows[0]
      if (row.state === 'submitted') {
        await client.query(
          'UPDATE matching_batches SET polled_at=now() WHERE request_id=$1',
          [id],
        )
        let batch
        try {
          batch = await api.retrieve(batchRow.batch_id)
          if (batch.input_file_id !== batchRow.input_file_id)
            throw new BatchError('format')
        } catch (e) {
          await client.query(
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
        await client.query(
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
              client,
              id,
              row.attempt_id,
              'failed',
              batchFailure(
                'Nieprawidłowy lub niedostępny plik wyników Batch. Koszt wymaga sprawdzenia.',
                error,
              ),
            )
            return
          }
          // A transient download failure remains retryable, including terminal batches.
          await client.query(
            'UPDATE matching_requests SET error=$2 WHERE id=$1',
            [
              id,
              batchFailure(
                'Odbiór wyników nie powiódł się; odczyt zostanie wznowiony.',
                error,
              ),
            ],
          )
          return
        }
        await applyMatchingLine(client, row, results.get(id), batch)
      }
      // Cleanup is independent of result validity and never resubmits a request.
      const cleanup = (
        await client.query(
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
          await client.query(
            'UPDATE matching_batches SET cleaned=true WHERE request_id=$1',
            [id],
          )
        } catch {
          /* Recovery retries file cleanup, not evaluation. */
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        `matching-${id}`,
      ])
    }
  } finally {
    client.release()
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
  const result = await pool.query<MatchingHistory>(
    `SELECT r.id,r.state,r.result,r.calculation,r.error,r.created_at,r.updated_at,r.profile_version_id,r.ad_revision_id,r.input->'checks' AS checks,r.input->'criteria' AS criteria,v.number AS profile_number,ar.retrieved_at AS offer_version_at,coalesce(g.batch_id,b.batch_id) AS batch_id,coalesce(g.status,b.status) AS batch_status,coalesce(g.cleaned,b.cleaned) AS cleaned,
    (r.profile_version_id IS DISTINCT FROM h.active_version_id OR r.ad_revision_id IS DISTINCT FROM a.current_revision_id) AS stale
    FROM matching_requests r JOIN source_ads a ON a.id=r.ad_id JOIN profile_versions v ON v.id=r.profile_version_id JOIN source_ad_revisions ar ON ar.id=r.ad_revision_id CROSS JOIN profile_head h LEFT JOIN matching_batches b ON b.request_id=r.id LEFT JOIN matching_groups g ON g.id=r.group_id WHERE r.ad_id=$1 ORDER BY r.created_at DESC,r.id DESC`,
    [adId],
  )
  const config = matchingConfiguration()
  const profileReady =
    (
      await pool.query(
        'SELECT active_version_id IS NOT NULL AS ready FROM profile_head WHERE singleton',
      )
    ).rows[0]?.ready === true
  return {
    configured: config !== null,
    profileReady,
    maximumCostPln: config
      ? chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens)
      : null,
    history: result.rows,
    ...(await readRatings(pool, adId)),
  }
}
