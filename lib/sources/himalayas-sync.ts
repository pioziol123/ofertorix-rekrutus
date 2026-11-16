import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { fingerprint, parameters, source } from './himalayas.ts'
import type { ConnectorResult } from '../../modules/sources/infrastructure/adapters/connector.ts'
import {
  createHimalayasConnector,
  incompleteReason,
  type HimalayasPageFetcher,
} from '../../modules/sources/infrastructure/adapters/himalayas/connector.ts'
import { saveOffers, transaction } from './store.ts'
import { scheduleDay } from './solid.ts'

// Manual pilot only. No scheduler, AI or queue retry is involved.
export async function syncHimalayas(
  pool: Pool,
  fetchPage?: HimalayasPageFetcher,
) {
  const connector = createHimalayasConnector(fetchPage)
  const client = await pool.connect()
  let locked = false,
    lost = false
  const disconnected = () => {
    lost = true
  }
  client.on('error', disconnected)
  const id = randomUUID()
  try {
    locked = (
      await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        ['himalayas-execution'],
      )
    ).rows[0]!.locked
    if (!locked) throw new Error('Himalayas import already running')
    const run = await transaction(client, async () => {
      await client.query(
        `UPDATE source_sync_runs SET status=CASE WHEN seen>0 THEN 'partial' ELSE 'failed' END,
        error='Himalayas pilot interrupted',finished_at=now() WHERE status='running'
        AND scope_id IN (SELECT id FROM source_scopes WHERE source=$1)`,
        [source],
      )
      const scope = await client.query<{ id: string }>(
        `INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES ($1,$2,$3,$4)
        ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id`,
        [randomUUID(), source, fingerprint, connector.scopeParameters()],
      )
      const scopeId = scope.rows[0]!.id
      await client.query(
        `INSERT INTO source_sync_runs(id,scope_id,trigger,status,started_at,schedule_day)
        VALUES ($1,$2,'manual','running',now(),$3)`,
        [id, scopeId, scheduleDay()],
      )
      return { id, scope_id: scopeId }
    })
    let saved = 0
    let batches = 0
    let outcome: ConnectorResult
    try {
      outcome = await connector.fetch(
        connector.scopeParameters(),
        async (ads) => {
          batches++
          if (lost) throw new Error('Database session lost')
          await saveOffers(
            client,
            run,
            ads.map((ad) => ad.content),
            source,
          )
          saved += ads.length
        },
        new AbortController().signal,
      )
    } catch (error) {
      // A failed batch save ends the run as incomplete, like a fetch failure.
      if (lost) throw error
      outcome = {
        complete: false,
        reason: incompleteReason,
        diagnostics: {
          query: parameters,
          pages: batches,
          stopReason: 'fetch_or_processing_error',
          marketComplete: false,
        },
      }
    }
    const status = outcome.complete ? 'complete' : saved ? 'partial' : 'failed'
    const result = await client.query(
      `UPDATE source_sync_runs SET status=$2,error=$3,diagnostics=$4,finished_at=now()
      WHERE id=$1 RETURNING id,status,seen,revisions,pages,error,diagnostics`,
      [
        id,
        status,
        outcome.complete ? null : outcome.reason,
        outcome.diagnostics ?? null,
      ],
    )
    return result.rows[0]!
  } finally {
    client.off('error', disconnected)
    try {
      if (locked && !lost)
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          'himalayas-execution',
        ])
    } finally {
      client.release(lost)
    }
  }
}
