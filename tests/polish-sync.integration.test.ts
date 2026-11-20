import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { setPool } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  readSyncState,
  requestSync,
  syncJob,
} from '../modules/sources/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  polishCatalog,
  polishSources,
  type PolishQuery,
} from '../modules/sources/infrastructure/adapters/polish/runner.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readOffers } from '../modules/offers/read-offers.ts'
import {
  deliver,
  prepareSyncRunQueue,
  sourcesMigrations,
} from './sync-run.fixtures.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { hash } from '../modules/sources/infrastructure/adapters/solid-jobs/api.ts'
import { nfjAliasRecord } from './fixtures/polish/json-record.ts'
import { query, record, result } from './fixtures/polish/result.ts'
import { polishWith } from './source-connectors.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('Polish sources in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `polish_test_${suffix}`,
    queueSchema = `polish_queue_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 8,
    })
    // The batch save uses the shared database access (T-03).
    setPool(pool)
    for (const migration of sourcesMigrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    await prepareSyncRunQueue(queueSchema)
    // Requests send their jobs on the queue library's client of this schema.
    process.env.PG_BOSS_SCHEMA = queueSchema
  }, 30_000)
  beforeEach(async () => {
    vi.stubEnv('POLISH_SOURCES', polishSources.join(','))
    await pool.query(
      'TRUNCATE source_run_seen,source_ad_revisions,source_ads,source_sync_runs,source_scopes CASCADE',
    )
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await stopQueues()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })
  const enqueuePolish = (q: PolishQuery) =>
    requestSync({ source: q.source, scopeRequest: q })
  const polishStatus = (runId: string, source = 'bulldogjob') =>
    readSyncState({ source, runId })
  async function run(
    q: PolishQuery = query(),
    records = [record(q.source)],
    overrides: Record<string, unknown> = {},
  ) {
    const queued = await enqueuePolish(q)
    await deliver(
      queued.id,
      polishWith(async () => result(q, records, overrides), q.source),
    )
    return (
      await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [
        queued.id,
      ])
    ).rows[0]
  }
  it('creates one run and one job for concurrent requests of a source and queues the other source independently (B5-R02)', async () => {
    const requests = await Promise.all(
      Array.from({ length: 4 }, () => enqueuePolish(query())),
    )
    expect(new Set(requests.map((r) => r.id)).size).toBe(1)
    expect(requests.filter((r) => !r.existing)).toHaveLength(1)
    const other = await enqueuePolish(query('theprotocol'))
    expect(other.id).not.toBe(requests[0]!.id)
    expect(
      (
        await admin.query(
          `SELECT data, singleton_key FROM ${queueSchema}.job
          WHERE name=$1 AND data->>'runId' = ANY($2::text[])
          ORDER BY created_on`,
          [syncJob.queue, [requests[0]!.id, other.id]],
        )
      ).rows,
    ).toEqual([
      {
        data: { runId: requests[0]!.id, source: 'bulldogjob' },
        singleton_key: 'bulldogjob',
      },
      {
        data: { runId: other.id, source: 'theprotocol' },
        singleton_key: 'theprotocol',
      },
    ])
  })
  it.each(polishSources)(
    'persists raw %s fields and idempotently records content changes',
    async (source) => {
      const q = query(source)
      expect(await run(q)).toMatchObject({
        status: 'complete',
        seen: 1,
        revisions: 1,
      })
      expect(await run(q)).toMatchObject({
        status: 'complete',
        seen: 1,
        revisions: 0,
      })
      const changed = record(source)
      changed.detail.futureField = { changed: true }
      expect(await run(q, [changed])).toMatchObject({ revisions: 1 })
      expect(await run(q)).toMatchObject({ revisions: 1 })
      const stored = (await pool.query('SELECT * FROM source_ads')).rows
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        source,
        external_id:
          source === 'justjoinit'
            ? record(source).listing.guid
            : source === 'nofluffjobs'
              ? String(record(source).listing.id).toLowerCase()
              : record(source).listing.id,
        url: record(source).url,
        availability: 'available',
      })
      expect(
        (await pool.query('SELECT * FROM source_ad_revisions')).rows,
      ).toHaveLength(3)
      const offers = await readOffers()
      expect(offers[0]).toMatchObject({
        source: polishCatalog[source].name,
        url: record(source).url,
      })
      const payload = (
        await pool.query(
          'SELECT payload FROM source_ad_revisions ORDER BY retrieved_at LIMIT 1',
        )
      ).rows[0].payload
      expect(payload.sourceRecord).toEqual({
        listing: record(source).listing,
        detail: record(source).detail,
      })
    },
  )
  it.each([
    [
      'bulldogjob',
      '123-one',
      'https://bulldogjob.pl/companies/jobs/123-one',
      null,
      '93e2c2840b1fb36b9b94efdfe9d431c6d88dfd4a7166c5efc0fd14b51d18ba30',
    ],
    [
      'theprotocol',
      'one',
      'https://theprotocol.it/praca/senior-php,oferta,one',
      null,
      '399d859d9c64b7181e90916dcf2d4684430378c847899514c45906e85c5ca267',
    ],
    [
      'justjoinit',
      'fixture-guid-one',
      'https://justjoin.it/job-offer/fixture-senior-php-one',
      '2026-12-02T23:59:59.000Z',
      '7847a0a81090d9bc607fcf6de28a9cc91378a00d0e8a1831c3f5085707a5aa4d',
    ],
    [
      'nofluffjobs',
      'fixture-php-one-remote',
      'https://nofluffjobs.com/pl/job/fixture-public-php-one-remote',
      null,
      '3324ad12577297bc8e3cba48108ee89ecc0f1c83cc0dc3cb16b83a4149410767',
    ],
  ] as const)(
    'stores %s ads with the identifiers, links, expiry, hashes and content from before connectors',
    async (source, external_id, url, valid_to, content_hash) => {
      expect((await run(query(source))).status).toBe('complete')
      expect(
        (
          await pool.query(
            'SELECT a.external_id,a.url,a.valid_to,r.content_hash,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id ORDER BY a.external_id',
          )
        ).rows.map(({ payload, valid_to, ...row }) => {
          // The stored content is the content the hash was computed from.
          expect(hash(payload)).toBe(row.content_hash)
          return { ...row, valid_to: valid_to?.toISOString() ?? null }
        }),
      ).toEqual([{ external_id, url, valid_to, content_hash }])
    },
  )
  // ASM-2: since 0mq.5 the page counter counts saved batches, one per
  // helper result; the helper's page count stays in the diagnostics.
  it("counts the saved batch, not the helper's pages, and keeps them in the diagnostics (ASM-2)", async () => {
    const diagnostics = { ...result().diagnostics, pages: 3 }
    const row = await run(query(), [record('bulldogjob')], { diagnostics })
    expect(row).toMatchObject({
      status: 'complete',
      pages: 1,
      diagnostics: { pages: 3 },
    })
  })
  it('persists regional NFJ aliases as one canonical offer across imports', async () => {
    const q = query('nofluffjobs')
    const city = nfjAliasRecord('city'),
      region = nfjAliasRecord('region')
    expect(await run(q, [city])).toMatchObject({
      status: 'complete',
      seen: 1,
      revisions: 1,
    })
    expect(await run(q, [region])).toMatchObject({
      status: 'complete',
      seen: 1,
      revisions: 1,
    })
    const stored = (await pool.query('SELECT external_id,url FROM source_ads'))
      .rows
    expect(stored).toEqual([
      {
        external_id: 'fixture-php-remote',
        url: 'https://nofluffjobs.com/pl/job/fixture-php-remote',
      },
    ])
    expect(
      (await pool.query('SELECT * FROM source_ad_revisions')).rows,
    ).toHaveLength(2)
  })
  it('retains old availability after partial and complete empty filtered searches', async () => {
    await run()
    const base = result()
    expect(
      await run(query(), [record('bulldogjob', 'new')], {
        status: 'partial',
        diagnostics: { ...base.diagnostics, stopReason: 'challenge' },
      }),
    ).toMatchObject({ status: 'partial', seen: 1 })
    expect(await run(query(), [])).toMatchObject({
      status: 'complete',
      seen: 0,
    })
    expect(
      (await pool.query('SELECT availability FROM source_ads')).rows,
    ).toEqual([{ availability: 'available' }, { availability: 'available' }])
  })
  // Since 0mq.5 the shared executor runs a delivered run with its own
  // source's connector; the queue no longer selects the source (A5-R01).
  it('does not expose a run through another source', async () => {
    const queued = await enqueuePolish(query('theprotocol'))
    expect((await polishStatus(queued.id, 'bulldogjob')).run).toBeNull()
    expect((await polishStatus(queued.id, 'theprotocol')).run?.status).toBe(
      'queued',
    )
  })
  it('redacts arbitrary subprocess failures and permits a later import', async () => {
    const queued = await enqueuePolish(query())
    await deliver(
      queued.id,
      polishWith(async () => {
        throw new Error('SECRET cookie and database url')
      }, 'bulldogjob'),
    )
    // Since 0mq.5 the shared executor stores one generic message (A5-R01).
    expect((await polishStatus(queued.id)).run).toMatchObject({
      status: 'failed',
      seen: 0,
      error: 'Import interrupted by a storage or processing error',
    })
    expect((await enqueuePolish(query())).id).not.toBe(queued.id)
  })
})
