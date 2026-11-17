import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool, transaction } from '../../lib/db.ts'
import { readOffer } from '../offers/index.ts'
import { hash } from './domain/canonical-hash.ts'
import {
  toConnectorAd,
  type AdContent,
  type ConnectorAd,
} from './infrastructure/adapters/connector.ts'
import { BatchSaveError, saveBatch, type BatchRun } from './save-batch.ts'
import { admitRun, finishRun, readRun, startRun } from './sync-run-state.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('batch save in an isolated PostgreSQL schema', () => {
  const schema = `save_batch_${randomUUID().replaceAll('-', '')}`
  const source = 'test-source'
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 4,
    })
    for (const migration of [
      '1770000000001_sources',
      '1770000000005_jobspy',
      '1770000000014_sync_run_state',
      '1770000000015_sync_run_attempt',
    ]) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    setPool(pool)
  }, 30_000)

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
  })

  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  /** A running run of the scope with the keyword. */
  async function runningRun(keyword = 'php'): Promise<BatchRun> {
    const { id } = await admitRun({
      source,
      parameters: { source, keyword },
      trigger: 'manual',
      scheduleDay: '2026-11-16',
      sendJob: async () => randomUUID(),
    })
    const run = await startRun(id)
    return { id, scopeId: run!.scopeId, source }
  }

  const ad = (
    key: string,
    extra: Partial<Omit<AdContent, 'jobOfferKey'>> = {},
  ): ConnectorAd =>
    toConnectorAd({
      jobOfferKey: key,
      title: `Offer ${key}`,
      url: `https://example.test/${key}`,
      ...extra,
    })
  /** Violates the NOT NULL constraint on the ad's external id. */
  const brokenAd = (): ConnectorAd => ({
    ...ad('broken'),
    externalId: null as unknown as string,
  })

  const ads = async () =>
    (
      await pool.query<{
        id: string
        external_id: string
        availability: string
        valid_to: Date | null
        last_seen_scope_id: string
      }>(
        'SELECT id,external_id,availability,valid_to,last_seen_scope_id FROM source_ads ORDER BY external_id',
      )
    ).rows
  const adId = async (key: string) =>
    (
      await pool.query<{ id: string }>(
        'SELECT id FROM source_ads WHERE external_id=$1',
        [key],
      )
    ).rows[0]!.id
  const observations = async (runId: string) =>
    (
      await pool.query<{ external_id: string }>(
        `SELECT a.external_id FROM source_run_seen s JOIN source_ads a ON a.id=s.source_ad_id
        WHERE s.run_id=$1 ORDER BY a.external_id`,
        [runId],
      )
    ).rows.map((row) => row.external_id)
  const revisions = async (key: string) =>
    (
      await pool.query<{ content_hash: string; current: boolean }>(
        `SELECT r.content_hash, r.id=a.current_revision_id AS current
        FROM source_ad_revisions r JOIN source_ads a ON a.id=r.source_ad_id
        WHERE a.external_id=$1 ORDER BY r.retrieved_at, (r.id=a.current_revision_id)`,
        [key],
      )
    ).rows
  const counters = async (runId: string) => {
    const run = await readRun(runId)
    return {
      pages: run!.pages,
      uniqueAds: run!.uniqueAds,
      revisions: run!.revisions,
    }
  }

  it('keeps the first two batches when the third fails (A4-AC01)', async () => {
    const run = await runningRun()
    await saveBatch(run, [ad('a'), ad('b')])
    await saveBatch(run, [ad('c')])
    await expect(saveBatch(run, [ad('d'), brokenAd()])).rejects.toThrow(
      BatchSaveError,
    )
    expect((await ads()).map((row) => row.external_id)).toEqual(['a', 'b', 'c'])
    expect(await observations(run.id)).toEqual(['a', 'b', 'c'])
    for (const key of ['a', 'b', 'c'])
      expect(await revisions(key)).toEqual([
        { content_hash: hash(ad(key).content), current: true },
      ])
    expect(await counters(run.id)).toEqual({
      pages: 2,
      uniqueAds: 3,
      revisions: 3,
    })
  })

  it('keeps one ad across scopes and versions only changed content (A4-AC02)', async () => {
    const php = await runningRun('php')
    expect(await saveBatch(php, [ad('x')])).toEqual({
      newObservations: 1,
      repeatedObservations: 0,
      newRevisions: 1,
    })
    await finishRun(php.id, { status: 'complete', error: null })
    const java = await runningRun('java')
    expect(java.scopeId).not.toBe(php.scopeId)
    expect(await saveBatch(java, [ad('x')])).toEqual({
      newObservations: 1,
      repeatedObservations: 0,
      newRevisions: 0,
    })
    await finishRun(java.id, { status: 'complete', error: null })
    expect(await ads()).toHaveLength(1)
    expect(await observations(php.id)).toEqual(['x'])
    expect(await observations(java.id)).toEqual(['x'])
    expect(await revisions('x')).toEqual([
      { content_hash: hash(ad('x').content), current: true },
    ])

    const again = await runningRun('php')
    const changed = ad('x', { title: 'Changed title' })
    expect(await saveBatch(again, [changed])).toEqual({
      newObservations: 1,
      repeatedObservations: 0,
      newRevisions: 1,
    })
    expect(await ads()).toHaveLength(1)
    expect(await revisions('x')).toEqual([
      { content_hash: hash(ad('x').content), current: false },
      { content_hash: hash(changed.content), current: true },
    ])
  })

  it('restores an observed ad and keeps the absent one when the run is cut short (A4-AC03, A4-AC04)', async () => {
    const earlier = await runningRun()
    await saveBatch(earlier, [ad('a'), ad('b')])
    await finishRun(earlier.id, { status: 'complete', error: null })
    await pool.query(
      `UPDATE source_ads SET availability='unavailable' WHERE external_id='a'`,
    )

    const partial = await runningRun()
    await saveBatch(partial, [ad('a')])
    await finishRun(partial.id, {
      status: 'partial',
      error: 'Import interrupted',
    })
    const failed = await runningRun()
    await finishRun(failed.id, { status: 'failed', error: 'Source down' })

    expect(
      (await ads()).map((row) => [row.external_id, row.availability]),
    ).toEqual([
      ['a', 'available'],
      ['b', 'available'],
    ])
  })

  it('keeps an observed past expiry and leaves an ad without one undated (A4-AC05)', async () => {
    const run = await runningRun()
    await saveBatch(run, [
      ad('expired', { validTo: '2020-01-01T00:00:00.000Z' }),
      ad('undated'),
    ])
    await finishRun(run.id, { status: 'complete', error: null })
    await pool.query(
      `UPDATE source_ads SET availability='unavailable' WHERE external_id='expired'`,
    )
    const again = await runningRun()
    await saveBatch(again, [
      ad('expired', { validTo: '2020-01-01T00:00:00.000Z' }),
      ad('undated'),
    ])

    const expired = await readOffer(await adId('expired'))
    expect(expired).toMatchObject({
      availability: 'available',
      expired: true,
      validTo: '2020-01-01T00:00:00.000Z',
    })
    const undated = await readOffer(await adId('undated'))
    expect(undated).toMatchObject({
      availability: 'available',
      expired: false,
      validTo: null,
    })
  })

  it('counts a repeated ad once per run, in a batch and across batches, and saves the next batch (A4-AC06, A4-AC07)', async () => {
    const run = await runningRun()
    expect(await saveBatch(run, [ad('a'), ad('b'), ad('a')])).toEqual({
      newObservations: 2,
      repeatedObservations: 1,
      newRevisions: 2,
    })
    expect(await saveBatch(run, [ad('b'), ad('c')])).toEqual({
      newObservations: 1,
      repeatedObservations: 1,
      newRevisions: 1,
    })
    expect(await saveBatch(run, [ad('d')])).toEqual({
      newObservations: 1,
      repeatedObservations: 0,
      newRevisions: 1,
    })
    expect(await counters(run.id)).toEqual({
      pages: 3,
      uniqueAds: 4,
      revisions: 4,
    })
    expect(await observations(run.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(await ads()).toHaveLength(4)
  })

  it('rolls the whole batch back and reports a save error (A4-AC08)', async () => {
    const run = await runningRun()
    await saveBatch(run, [ad('a')])
    const error = await saveBatch(run, [ad('b'), brokenAd(), ad('c')]).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(BatchSaveError)
    expect((error as BatchSaveError).cause).toMatchObject({ code: '23502' })
    expect((await ads()).map((row) => row.external_id)).toEqual(['a'])
    expect(await observations(run.id)).toEqual(['a'])
    expect(await counters(run.id)).toEqual({
      pages: 1,
      uniqueAds: 1,
      revisions: 1,
    })
  })

  it('becomes part of a running transaction and rolls back with it', async () => {
    const run = await runningRun()
    await expect(
      transaction(async () => {
        await saveBatch(run, [ad('a')])
        throw new Error('caller failed')
      }),
    ).rejects.toThrow('caller failed')
    expect(await ads()).toEqual([])
    expect(await counters(run.id)).toEqual({
      pages: 0,
      uniqueAds: 0,
      revisions: 0,
    })
  })
})
