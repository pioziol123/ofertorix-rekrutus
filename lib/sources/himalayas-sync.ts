import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import {
  createPageFetcher,
  fingerprint,
  HimalayasHttpError,
  parameters,
  source,
  type HimalayasPage,
} from './himalayas.ts'
import { saveOffers, transaction } from './store.ts'
import { scheduleDay } from './solid.ts'

// Manual pilot only. No scheduler, AI or queue retry is involved.
export async function syncHimalayas(
  pool: Pool,
  fetchPage: (page: number) => Promise<HimalayasPage> = createPageFetcher(),
) {
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
        [randomUUID(), source, fingerprint, parameters],
      )
      const scopeId = scope.rows[0]!.id
      await client.query(
        `INSERT INTO source_sync_runs(id,scope_id,trigger,status,started_at,schedule_day)
        VALUES ($1,$2,'manual','running',now(),$3)`,
        [id, scopeId, scheduleDay()],
      )
      return { id, scope_id: scopeId }
    })
    const diagnostics = {
      query: parameters,
      pages: 0,
      totalCount: null as number | null,
      duplicates: 0,
      rejected: 0,
      missingDescriptions: 0,
      stopReason: 'exhausted',
      retryAfter: null as string | null,
      marketComplete: false,
    }
    const ids = new Set<string>()
    let saved = 0
    let incomplete = false
    const deadline = Date.now() + 120_000
    try {
      for (let index = 1; index <= parameters.maxPages; index++) {
        if (Date.now() + 21_000 > deadline) {
          incomplete = true
          diagnostics.stopReason = 'deadline'
          break
        }
        const page = await fetchPage(index)
        if (lost) throw new Error('Database session lost')
        diagnostics.pages++
        diagnostics.totalCount ??= page.totalCount
        diagnostics.rejected += page.rejected
        diagnostics.missingDescriptions += page.missingDescriptions
        const unique = page.jobs.filter((job) => {
          if (ids.has(job.jobOfferKey)) {
            diagnostics.duplicates++
            return false
          }
          ids.add(job.jobOfferKey)
          return true
        })
        await saveOffers(client, run, unique, source)
        saved += unique.length
        incomplete ||=
          page.rejected > 0 ||
          page.missingDescriptions > 0 ||
          diagnostics.duplicates > 0
        if (!page.valid || page.totalCount !== diagnostics.totalCount) {
          incomplete = true
          diagnostics.stopReason = 'changing_pagination'
          break
        }
        if (index * 20 >= page.totalCount) break
        if (index === parameters.maxPages) {
          incomplete = true
          diagnostics.stopReason = 'page_limit'
        }
      }
    } catch (error) {
      if (lost) throw error
      incomplete = true
      diagnostics.stopReason =
        error instanceof HimalayasHttpError
          ? `http_${error.status}`
          : 'fetch_or_processing_error'
      // Preserve only bounded numeric/date Retry-After, never arbitrary response text.
      const retry =
        error instanceof HimalayasHttpError ? error.retryAfter : null
      if (
        retry &&
        retry.length <= 100 &&
        (/^\d+$/.test(retry) || Number.isFinite(Date.parse(retry)))
      )
        diagnostics.retryAfter = retry
    }
    const status = incomplete ? (saved ? 'partial' : 'failed') : 'complete'
    const result = await client.query(
      `UPDATE source_sync_runs SET status=$2,error=$3,diagnostics=$4,finished_at=now()
      WHERE id=$1 RETURNING id,status,seen,revisions,pages,error,diagnostics`,
      [
        id,
        status,
        incomplete ? 'Himalayas pilot incomplete; inspect diagnostics' : null,
        diagnostics,
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
