import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
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
  enqueuePolish,
  executePolish,
  polishStatus,
  recoverPolish,
} from '../lib/sources/polish-sync.ts'
import {
  polishQueue,
  polishCatalog,
  polishSources,
  type PolishQuery,
} from '../lib/sources/polish.ts'
import { readOffers } from '../lib/offers.ts'
import { hash } from '../lib/sources/solid.ts'
import { nfjAliasRecord } from './fixtures/polish/json-record.ts'
import { query, record, result } from './fixtures/polish/result.ts'
import { polishWith } from './source-connectors.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('Polish sources in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `polish_test_${suffix}`,
    queueSchema = `polish_queue_${suffix}`
  let admin: Pool, pool: Pool, boss: PgBoss
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 8,
    })
    for (const migration of ['1770000000001_sources', '1770000000005_jobspy']) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
    })
    boss.on('error', () => {})
    await boss.start()
    for (const source of polishSources)
      await boss.createQueue(polishQueue(source), { retryLimit: 0 })
  }, 30_000)
  beforeEach(async () => {
    vi.stubEnv('POLISH_SOURCES', polishSources.join(','))
    await pool.query(
      'TRUNCATE source_run_seen,source_ad_revisions,source_ads,source_sync_runs,source_scopes CASCADE',
    )
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await boss?.stop()
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })
  async function run(
    q: PolishQuery = query(),
    records = [record(q.source)],
    overrides: Record<string, unknown> = {},
  ) {
    const queued = await enqueuePolish(pool, boss, q)
    await executePolish(
      pool,
      boss,
      queued.id,
      q.source,
      polishWith(async () => result(q, records, overrides), q.source),
    )
    return (
      await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [
        queued.id,
      ])
    ).rows[0]
  }
  it('deduplicates concurrent requests per source and independently queues the other source', async () => {
    const requests = await Promise.all(
      Array.from({ length: 4 }, () => enqueuePolish(pool, boss, query())),
    )
    expect(new Set(requests.map((r) => r.id)).size).toBe(1)
    expect(requests.filter((r) => !r.reused)).toHaveLength(1)
    const other = await enqueuePolish(pool, boss, query('theprotocol'))
    expect(other.id).not.toBe(requests[0]!.id)
    const run = (
      await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [other.id])
    ).rows[0]
    expect(
      (await boss.getJobById(polishQueue('theprotocol'), run.job_id))?.data,
    ).toEqual({ runId: other.id })
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
      const offers = await readOffers(pool)
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
  it('rejects wrong-source execution and does not expose its run through another source', async () => {
    const queued = await enqueuePolish(pool, boss, query('theprotocol'))
    const collect = vi.fn()
    await executePolish(
      pool,
      boss,
      queued.id,
      'bulldogjob',
      polishWith(collect, 'bulldogjob'),
    )
    expect(collect).not.toHaveBeenCalled()
    expect((await polishStatus(pool, queued.id, 'bulldogjob')).run).toBeNull()
    expect(
      (await polishStatus(pool, queued.id, 'theprotocol')).run?.status,
    ).toBe('queued')
  })
  it('recovers orphaned running imports only within the selected source', async () => {
    const first = await enqueuePolish(pool, boss, query()),
      second = await enqueuePolish(pool, boss, query('theprotocol'))
    await pool.query("UPDATE source_sync_runs SET status='running'")
    await recoverPolish(pool, boss, 'bulldogjob')
    expect((await polishStatus(pool, first.id, 'bulldogjob')).run?.status).toBe(
      'failed',
    )
    expect(
      (await polishStatus(pool, second.id, 'theprotocol')).run?.status,
    ).toBe('running')
    const collect = vi.fn()
    await executePolish(
      pool,
      boss,
      first.id,
      'bulldogjob',
      polishWith(collect, 'bulldogjob'),
    )
    expect(collect).not.toHaveBeenCalled()
  })
  it('protects an active execution from recovery and duplicate delivery', async () => {
    const queued = await enqueuePolish(pool, boss, query())
    let release!: () => void, entered!: () => void
    const started = new Promise<void>((resolve) => {
        entered = resolve
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    const execution = executePolish(
      pool,
      boss,
      queued.id,
      'bulldogjob',
      polishWith(async () => {
        entered()
        await gate
        return result()
      }, 'bulldogjob'),
    )
    await started
    try {
      await recoverPolish(pool, boss, 'bulldogjob')
      const duplicate = vi.fn()
      await executePolish(
        pool,
        boss,
        queued.id,
        'bulldogjob',
        polishWith(duplicate, 'bulldogjob'),
      )
      expect(duplicate).not.toHaveBeenCalled()
      expect((await polishStatus(pool, queued.id)).run?.status).toBe('running')
    } finally {
      release()
      await execution
    }
    expect((await polishStatus(pool, queued.id)).run?.status).toBe('complete')
  })
  it('redacts arbitrary subprocess failures and permits a later import', async () => {
    const queued = await enqueuePolish(pool, boss, query())
    await executePolish(
      pool,
      boss,
      queued.id,
      'bulldogjob',
      polishWith(async () => {
        throw new Error('SECRET cookie and database url')
      }, 'bulldogjob'),
    )
    expect((await polishStatus(pool, queued.id)).run).toMatchObject({
      status: 'failed',
      seen: 0,
      error: 'Polish source import failed',
    })
    expect((await enqueuePolish(pool, boss, query())).id).not.toBe(queued.id)
  })
})
