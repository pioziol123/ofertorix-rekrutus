import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { PgBoss } from 'pg-boss'
import type { ExecutionSnapshot } from '../../modules/ai/index.ts'
import {
  savedEndpoint,
  ModelError,
  emptyUsage,
  OllamaAdapter,
  localFetch,
} from '../../modules/ai/index.ts'
import {
  claimLocal,
  authorizeLocalRequest,
  renewLocal,
  archiveLocal,
  finishLocal,
} from '../ai/operations/local.ts'
import { requireQueued } from '../queue.ts'
import { aiQueue } from './imports.ts'
import { ProfileConflict, tx } from './store.ts'
import { AiResultError, readAiProposal } from './ai-result.ts'

export async function enqueueLocalProfile(
  client: PoolClient,
  boss: PgBoss,
  importId: string,
  revision: number,
  snapshot: ExecutionSnapshot,
) {
  const executionId = randomUUID(),
    token = randomUUID(),
    id = randomUUID()
  const previous =
    (
      await client.query(
        'SELECT current_execution_id FROM profile_imports WHERE id=$1 FOR UPDATE',
        [importId],
      )
    ).rows[0]?.current_execution_id ?? null
  if (previous) {
    await client.query(
      "UPDATE ai_executions SET publication_allowed=false,disposition='superseded',revision=revision+1 WHERE id=$1",
      [previous],
    )
    const skipped = await client.query(
      "UPDATE ai_local_queue SET state='finished' WHERE execution_id=$1 AND state='queued' RETURNING execution_id",
      [previous],
    )
    if (skipped.rowCount)
      await client.query(
        "UPDATE ai_attempts SET state='settled',finished_at=now() WHERE execution_id=$1 AND state='queued'",
        [previous],
      )
  }
  await client.query(
    'INSERT INTO ai_executions(id,task_type,operation_id,supersedes,configuration,publication_token) VALUES($1,$2,$3,$4,$5,$6)',
    [executionId, 'profile', importId, previous, snapshot, token],
  )
  await client.query('INSERT INTO ai_local_queue(execution_id) VALUES($1)', [
    executionId,
  ])
  await client.query(
    "INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,state,reserved_pln,actual_pln,configuration,execution_id) VALUES($1,$2,$3,NULL,1,$4,'queued',0,0,$5,$6)",
    [id, importId, revision, randomUUID(), snapshot, executionId],
  )
  await client.query(
    "UPDATE profile_imports SET current_execution_id=$2,current_publication_token=$3,status='ai_queued',proposal=NULL,error=NULL,updated_at=now() WHERE id=$1",
    [importId, executionId, token],
  )
  await requireQueued(
    boss.send(
      aiQueue,
      { attemptId: id },
      {
        db: { executeSql: (sql, values) => client.query(sql, values) },
        retryLimit: 0,
        expireInSeconds: 300,
      },
    ),
  )
  return { id, state: 'queued', executionId }
}

// The panel can call this domain command; it never reads current configuration.
export async function retryLocalProfile(
  pool: Pool,
  boss: PgBoss,
  attemptId: string,
  expectedRevision: number,
) {
  const client = await pool.connect()
  try {
    return await tx(client, async () => {
      const attempt = (
        await client.query('SELECT * FROM ai_attempts WHERE id=$1', [attemptId])
      ).rows[0]
      if (!attempt?.execution_id)
        throw new ProfileConflict('Local attempt not found')
      const operation = (
        await client.query(
          'SELECT * FROM profile_imports WHERE id=$1 FOR UPDATE',
          [attempt.import_id],
        )
      ).rows[0]
      const execution = (
        await client.query(
          'SELECT * FROM ai_executions WHERE id=$1 FOR UPDATE',
          [attempt.execution_id],
        )
      ).rows[0]
      if (
        Number(execution.revision) !== expectedRevision ||
        operation.current_execution_id !== execution.id
      )
        throw new ProfileConflict('Execution changed')
      return enqueueLocalProfile(
        client,
        boss,
        attempt.import_id,
        attempt.text_revision,
        execution.configuration,
      )
    })
  } finally {
    client.release()
  }
}

export async function executeLocalProfile(
  pool: Pool,
  boss: PgBoss,
  attemptId: string,
  fetcher?: typeof fetch,
) {
  const client = await pool.connect()
  try {
    const attempt = (
      await client.query('SELECT * FROM ai_attempts WHERE id=$1', [attemptId])
    ).rows[0]
    if (!attempt?.execution_id || attempt.state !== 'queued') return
    const claim = await tx(client, () =>
      claimLocal(client, attempt.execution_id),
    )
    if (!claim) return
    await client.query("UPDATE ai_attempts SET state='running' WHERE id=$1", [
      attemptId,
    ])
    await client.query(
      "UPDATE profile_imports SET status='ai_running' WHERE id=$1 AND current_execution_id=$2",
      [attempt.import_id, claim.executionId],
    )
    const snapshot = attempt.configuration as ExecutionSnapshot
    let runtimeEnded = false,
      proposal: unknown = null,
      errorCode: string | null = null,
      errorMessage: string | null = null
    let usage = emptyUsage()
    const heartbeat = setInterval(() => {
      void renewLocal(pool, claim).catch(() => {})
    }, 15000)
    heartbeat.unref()
    try {
      if (snapshot.provider !== 'ollama') throw new ModelError('configuration')
      const endpoint = savedEndpoint(snapshot)
      const adapter = new OllamaAdapter(fetcher ?? localFetch, {
        url: endpoint.url,
        numCtx: snapshot.runtimeParameters.numCtx,
        modelDigest: snapshot.modelDigest,
        credential: () =>
          endpoint.credentialEnv
            ? process.env[endpoint.credentialEnv]
            : undefined,
        archive: (raw) => archiveLocal(pool, claim, raw),
        beforeGenerate: async () => {
          if (!(await authorizeLocalRequest(pool, claim)))
            throw new ModelError('configuration')
        },
      })
      const result = await adapter.generate(snapshot)
      runtimeEnded = true
      usage = result.usage
      proposal = readAiProposal(result, snapshot.input)
    } catch (error) {
      if (error instanceof ModelError) {
        runtimeEnded =
          error.details.runtimeEnded === true || !error.details.requestSent
        usage = error.details.usage ?? usage
        errorCode = error.code
      } else
        errorCode =
          error instanceof AiResultError ? 'invalid_proposal' : 'unknown'
      errorMessage =
        error instanceof AiResultError
          ? error.message
          : 'Nie udało się ukończyć lokalnej propozycji. Sprawdź stan wykonania przed ponowieniem.'
    } finally {
      clearInterval(heartbeat)
    }
    // Record the observed runtime end separately from domain publication.
    const mayPublish = await tx(client, () =>
      finishLocal(client, claim, runtimeEnded),
    )
    await tx(client, async () => {
      const operation = (
        await client.query(
          'SELECT * FROM profile_imports WHERE id=$1 FOR UPDATE',
          [attempt.import_id],
        )
      ).rows[0]
      const execution = (
        await client.query(
          'SELECT * FROM ai_executions WHERE id=$1 FOR UPDATE',
          [claim.executionId],
        )
      ).rows[0]
      const current =
        execution.publication_allowed &&
        execution.disposition === 'active' &&
        operation.current_execution_id === execution.id &&
        operation.current_publication_token === execution.publication_token &&
        operation.text_revision === attempt.text_revision
      await client.query(
        "UPDATE ai_attempts SET state='settled',actual_pln=0,usage=$2,proposal=$3,error=$4,finished_at=now() WHERE id=$1",
        [
          attemptId,
          {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
          },
          proposal,
          errorMessage,
        ],
      )
      await client.query(
        'UPDATE ai_executions SET result_status=$2,error_code=$3,finished_at=now(),revision=revision+1 WHERE id=$1',
        [claim.executionId, proposal ? 'completed' : 'failed', errorCode],
      )
      if (current)
        await client.query(
          'UPDATE profile_imports SET status=$2,proposal=$3,error=$4,updated_at=now() WHERE id=$1',
          [
            attempt.import_id,
            mayPublish && proposal ? 'proposal' : 'needs_attention',
            mayPublish ? proposal : null,
            mayPublish
              ? errorMessage
              : 'Worker utracił prawo do publikacji. Odpowiedź pozostała w historii.',
          ],
        )
    })
    // A durable queued row remains discoverable if this wakeup fails.
    if (runtimeEnded) await wakeLocalProfiles(pool, boss)
  } finally {
    client.release()
  }
}

export async function wakeLocalProfiles(pool: Pool, boss: PgBoss) {
  const queued = await pool.query(
    "SELECT a.id FROM ai_local_queue q JOIN ai_attempts a ON a.execution_id=q.execution_id JOIN ai_executions e ON e.id=q.execution_id WHERE q.state='queued' AND e.disposition='active' AND e.task_type='profile' ORDER BY q.queue_sequence",
  )
  for (const row of queued.rows)
    await boss.send(
      aiQueue,
      { attemptId: row.id },
      {
        singletonKey: row.id,
        singletonSeconds: 60,
        retryLimit: 0,
        expireInSeconds: 300,
      },
    )
}
export async function recoverLocalProfiles(pool: Pool, boss: PgBoss) {
  // Reconciliation observes only. It never frees an occupied slot or replays sent HTTP.
  await pool.query(
    "UPDATE ai_executions e SET runtime_state='unknown',runtime_observed_at=now(),revision=revision+1 FROM ai_local_slots s WHERE s.execution_id=e.id AND s.lease_until<now() AND e.runtime_state='running'",
  )
  await pool.query(
    "UPDATE profile_imports p SET status='needs_attention',error='Stan lokalnej generacji jest nieznany; miejsce pozostaje zajęte.' FROM ai_executions e WHERE p.current_execution_id=e.id AND e.runtime_state='unknown' AND p.status='ai_running'",
  )
  await wakeLocalProfiles(pool, boss)
}
