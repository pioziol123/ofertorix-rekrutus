import { requireQueued } from '../queue.ts'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Pool, PoolClient } from 'pg'
import type { PgBoss } from 'pg-boss'
import { aiQueue, scrubContacts } from './imports.ts'
import { ProfileConflict, tx } from './store.ts'
import type { AiConfiguration, ExecutionSnapshot } from '../ai/configuration.ts'
import { isExecutionSnapshot, savedEndpoint } from '../ai/configuration.ts'
import { reserve, chargeCeiling } from '../ai/budget.ts'
import { ModelError, emptyUsage } from '../ai/models/model.ts'
import type { StructuredModel } from '../ai/models/model.ts'
import { OpenAiAdapter } from '../ai/models/openai.ts'
import { profileConfiguration } from './ai-configuration.ts'
import { profileRequest } from './ai-prompt.ts'
import { AiResultError, readAiProposal } from './ai-result.ts'
import { enqueueLocalProfile, executeLocalProfile } from './local-ai.ts'
export { readAiProposal } from './ai-result.ts'

function pricingFor(
  config: AiConfiguration | ExecutionSnapshot,
): AiConfiguration {
  if (isExecutionSnapshot(config)) {
    if (config.provider !== 'openai' || !config.pricing)
      throw new ModelError('configuration')
    return config.pricing
  }
  // Existing paid snapshots use a string pricing version, not execution version 1.
  if (typeof config.version !== 'string') throw new ModelError('configuration')
  return config
}
async function createAttempt(
  client: PoolClient,
  boss: PgBoss,
  importId: string,
  revision: number,
  config: AiConfiguration | ExecutionSnapshot,
  generation = randomUUID(),
  attempt = 1,
) {
  const budget = await reserve(client, pricingFor(config))
  const id = randomUUID(),
    state = budget.enough ? 'queued' : 'waiting_budget'
  await client.query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,state,reserved_pln,configuration)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      importId,
      revision,
      budget.enough ? budget.month : null,
      attempt,
      generation,
      state,
      budget.enough ? budget.cost : '0',
      config,
    ],
  )
  if (budget.enough)
    await requireQueued(
      boss.send(
        aiQueue,
        { attemptId: id },
        {
          db: { executeSql: (sql, values) => client.query(sql, values) },
          retryLimit: 0,
          expireInSeconds: 300,
          priority: 10,
        },
      ),
    )
  await client.query(
    'UPDATE profile_imports SET status=$2,error=NULL,updated_at=now() WHERE id=$1',
    [importId, state === 'queued' ? 'ai_queued' : state],
  )
  return { id, state }
}
export async function prepareProposal(
  pool: Pool,
  boss: PgBoss,
  id: string,
  text: string,
  expectedRevision: number,
  fetcher?: typeof fetch,
) {
  if (!text.trim() || text.length > 120000)
    throw new Error('Invalid professional text')
  const sanitized = scrubContacts(text),
    config = await profileConfiguration(sanitized, fetcher)
  const client = await pool.connect()
  try {
    return await tx(client, async () => {
      const row = (
        await client.query(
          'SELECT * FROM profile_imports WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0]
      if (!row) throw new Error('Import not found')
      if (row.text_revision !== expectedRevision)
        throw new ProfileConflict('Import text changed')
      if (!row.source_text) throw new Error('Import has no extracted text')
      const active = await client.query(
        "SELECT 1 FROM ai_attempts WHERE import_id=$1 AND state IN ('queued','running','waiting_budget')",
        [id],
      )
      if (active.rowCount)
        throw new ProfileConflict('A proposal is already pending')
      const revision = expectedRevision + 1
      await client.query(
        'INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,$2,$3)',
        [id, revision, sanitized],
      )
      await client.query(
        'UPDATE profile_imports SET professional_text=$2,text_revision=$3,proposal=NULL,status=$4,error=NULL,updated_at=now() WHERE id=$1',
        [id, sanitized, revision, config ? 'ready' : 'needs_configuration'],
      )
      if (!config) return { state: 'needs_configuration' }
      if (isExecutionSnapshot(config) && config.provider === 'ollama')
        return enqueueLocalProfile(client, boss, id, revision, config)
      return createAttempt(client, boss, id, revision, config)
    })
  } finally {
    client.release()
  }
}
export async function resumeAi(pool: Pool, boss: PgBoss) {
  const client = await pool.connect()
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('profile-ai-global')) AS locked",
    )
    if (!lock.rows[0].locked) return
    try {
      // Only a process without a live global lock can reconcile interrupted network attempts.
      await client.query(
        "UPDATE ai_attempts SET state='unknown',error='Worker interrupted; cost remains reserved',finished_at=now() WHERE state='running' AND operation_type='profile' AND configuration->>'provider' IS DISTINCT FROM 'ollama'",
      )
      await client.query(
        "UPDATE profile_imports i SET status='needs_attention',error='Przerwano przygotowanie propozycji; koszt pozostaje zarezerwowany.' WHERE status='ai_running' AND EXISTS(SELECT 1 FROM ai_attempts a WHERE a.import_id=i.id AND a.text_revision=i.text_revision AND a.state='unknown' AND a.configuration->>'provider' IS DISTINCT FROM 'ollama')",
      )
      const waiting = await client.query(
        "SELECT * FROM ai_attempts WHERE operation_type='profile' AND configuration->>'provider' IS DISTINCT FROM 'ollama' AND state IN ('waiting_budget','queued') ORDER BY created_at",
      )
      for (const row of waiting.rows) {
        if (row.state === 'queued') {
          // Recreate missing delivery: a duplicate is harmless because executeAi claims state under the lock.
          await boss.send(
            aiQueue,
            { attemptId: row.id },
            {
              singletonKey: row.id,
              singletonSeconds: 60,
              retryLimit: 0,
              expireInSeconds: 300,
              priority: 10,
            },
          )
          continue
        }
        await tx(client, async () => {
          const budget = await reserve(client, pricingFor(row.configuration))
          if (!budget.enough) return
          await client.query(
            "UPDATE ai_attempts SET state='queued',month=$2,reserved_pln=$3 WHERE id=$1 AND state='waiting_budget'",
            [row.id, budget.month, budget.cost],
          )
          await requireQueued(
            boss.send(
              aiQueue,
              { attemptId: row.id },
              {
                db: { executeSql: (sql, values) => client.query(sql, values) },
                retryLimit: 0,
                expireInSeconds: 300,
                priority: 10,
              },
            ),
          )
          await client.query(
            "UPDATE profile_imports SET status='ai_queued' WHERE id=$1",
            [row.import_id],
          )
        })
      }
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('profile-ai-global'))",
      )
    }
  } finally {
    client.release()
  }
}

export async function executeAi(
  pool: Pool,
  boss: PgBoss,
  id: string,
  fetcher: typeof fetch = fetch,
) {
  const saved = (
    await pool.query('SELECT configuration FROM ai_attempts WHERE id=$1', [id])
  ).rows[0]?.configuration
  if (!saved) return
  if (saved.provider === 'ollama' && saved.version === 1)
    return executeLocalProfile(
      pool,
      boss,
      id,
      fetcher === fetch ? undefined : fetcher,
    )
  return executePaidProfile(pool, boss, id, (config) => {
    const pricing = pricingFor(config)
    if (isExecutionSnapshot(config)) {
      const endpoint = savedEndpoint(config)
      return new OpenAiAdapter(fetcher, {
        maxOutputTokens: pricing.maxOutputTokens,
        url: `${endpoint.url.replace(/\/$/, '')}/responses`,
        apiKey: () =>
          endpoint.credentialEnv
            ? process.env[endpoint.credentialEnv]
            : undefined,
      })
    }
    return new OpenAiAdapter(fetcher, {
      maxOutputTokens: pricing.maxOutputTokens,
    })
  })
}

export async function executePaidProfile(
  pool: Pool,
  boss: PgBoss,
  id: string,
  modelFor: (
    configuration: AiConfiguration | ExecutionSnapshot,
  ) => StructuredModel,
) {
  const client = await pool.connect()
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('profile-ai-global')) AS locked",
    )
    if (!lock.rows[0].locked) return
    try {
      const row = (
        await client.query(
          "UPDATE ai_attempts SET state='running' WHERE id=$1 AND state='queued' AND operation_type='profile' RETURNING *",
          [id],
        )
      ).rows[0]
      if (!row) return
      const config = row.configuration as AiConfiguration | ExecutionSnapshot
      const input = (
        await client.query(
          'SELECT text FROM profile_import_texts WHERE import_id=$1 AND revision=$2',
          [row.import_id, row.text_revision],
        )
      ).rows[0]?.text
      await client.query(
        "UPDATE profile_imports SET status='ai_running' WHERE id=$1 AND text_revision=$2",
        [row.import_id, row.text_revision],
      )
      let usage = emptyUsage(),
        responseId: string | null = null,
        proposal: unknown = null
      let retry = false,
        retryAfterMs = 1000,
        errorMessage: string | null = null
      let pricing: AiConfiguration | null = null
      try {
        pricing = pricingFor(config)
        const request = isExecutionSnapshot(config)
          ? config
          : profileRequest(input, config.model)
        const result = await modelFor(config).generate(request)
        usage = result.usage
        responseId = result.responseId
        proposal = readAiProposal(result, request.input)
      } catch (error) {
        if (error instanceof ModelError) {
          usage = error.details.usage ?? usage
          responseId = error.details.responseId ?? responseId
          const transient =
            error.details.httpStatus === 429 ||
            (error.details.httpStatus ?? 0) >= 500
          retry =
            (transient && error.details.retryAfterMs !== null) ||
            (error.details.requestSent === true &&
              !error.details.responseReceived &&
              error.code !== 'aborted')
          retryAfterMs = error.details.retryAfterMs ?? 1000
        }
        errorMessage =
          error instanceof AiResultError
            ? error.message
            : error instanceof ModelError &&
                error.code === 'format' &&
                error.details.runtimeEnded
              ? 'AI nie zwróciło jednej kompletnej propozycji. Profil pozostaje bez zmian.'
              : 'Nie udało się połączyć z AI lub odczytać odpowiedzi. Profil pozostaje bez zmian; koszt może pozostać zarezerwowany.'
      }
      const settled =
        pricing !== null &&
        usage.inputTokens !== null &&
        usage.outputTokens !== null &&
        usage.inputTokens <= pricing.maxInputTokens &&
        usage.outputTokens <= pricing.maxOutputTokens
      if (retry) await delay(retryAfterMs)
      await tx(client, async () => {
        await client.query(
          'UPDATE ai_attempts SET state=$2,actual_pln=$3,usage=$4,response_id=$5,proposal=$6,error=$7,finished_at=now() WHERE id=$1',
          [
            id,
            settled ? 'settled' : 'unknown',
            settled
              ? chargeCeiling(pricing!, usage.inputTokens!, usage.outputTokens!)
              : null,
            {
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
            },
            responseId,
            proposal,
            errorMessage,
          ],
        )
        await client.query(
          'UPDATE profile_imports SET status=$3,proposal=$4,error=$5,updated_at=now() WHERE id=$1 AND text_revision=$2',
          [
            row.import_id,
            row.text_revision,
            proposal ? 'proposal' : 'needs_attention',
            proposal,
            errorMessage,
          ],
        )
        if (retry && row.attempt < 2)
          await createAttempt(
            client,
            boss,
            row.import_id,
            row.text_revision,
            config,
            row.generation,
            row.attempt + 1,
          )
      })
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('profile-ai-global'))",
      )
    }
  } finally {
    client.release()
  }
}
