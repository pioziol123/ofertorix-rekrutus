import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { setPool } from '../lib/db.ts'
import { PgBoss } from 'pg-boss'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  executeSyncRun,
  recoverSyncRuns,
  requestScheduledSyncs,
  requestSync,
  syncQueue,
  syncQueueOptions,
  useSyncQueue,
} from '../modules/sources/index.ts'
import type { ConnectorProvider } from '../modules/sources/infrastructure/adapters/connector-registry.ts'
import { source, type Offer, type Page } from '../lib/sources/solid.ts'
import { createPageFetcher, hash } from '../lib/sources/solid.ts'
import { solidJobsWith } from './source-connectors.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
const page = (jobs: Offer[], overrides: Partial<Page> = {}): Page => ({
  jobs,
  valid: true,
  totalCount: jobs.length,
  totalPages: jobs.length ? 1 : 0,
  ...overrides,
})

integration('source ingestion in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `source_test_${suffix}`
  const queueSchema = `queue_test_${suffix}`
  let admin: Pool
  let pool: Pool
  let boss: PgBoss

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
    const sql: string[] = []
    for (const migration of [
      '1770000000001_sources',
      '1770000000005_jobspy',
      '1770000000014_sync_run_state',
      '1770000000015_sync_run_attempt',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join(';\n'))
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
    })
    boss.on('error', () => {})
    await boss.start()
    await boss.createQueue(syncQueue, syncQueueOptions)
    useSyncQueue(boss)
  }, 30_000)

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
  })

  afterAll(async () => {
    await boss?.stop()
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })

  // A queue delivery of the run's job, first attempt, to the shared executor.
  async function executeSync(runId: string, connectors: ConnectorProvider) {
    const { job_id } = (
      await pool.query('SELECT job_id FROM source_sync_runs WHERE id=$1', [
        runId,
      ])
    ).rows[0]
    await executeSyncRun(
      {
        runId,
        jobId: job_id,
        attempt: 0,
        signal: new AbortController().signal,
      },
      connectors,
    )
  }
  const recoverSync = () => recoverSyncRuns()
  const enqueueSync = () => requestSync({ source })

  async function run(jobs: Offer[], overrides: Partial<Page> = {}) {
    const queued = await enqueueSync()
    await executeSync(
      queued!.id,
      solidJobsWith(async () => page(jobs, overrides)),
    )
    return (
      await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [
        queued!.id,
      ])
    ).rows[0]
  }

  it('atomically rolls back the run and queue insert when enqueue fails', async () => {
    const jobsBefore = await admin.query(
      `SELECT count(*)::int AS n FROM ${queueSchema}.job`,
    )
    const originalSend = boss.send.bind(boss)
    const send = vi
      .spyOn(boss, 'send')
      .mockImplementationOnce(async (name, data, options) => {
        await originalSend(name, data, options)
        throw new Error('queue insert failed')
      })
    try {
      await expect(enqueueSync()).rejects.toThrow('queue insert failed')
    } finally {
      send.mockRestore()
    }
    expect((await pool.query('SELECT * FROM source_sync_runs')).rowCount).toBe(
      0,
    )
    expect((await pool.query('SELECT * FROM source_scopes')).rowCount).toBe(0)
    expect(
      (await admin.query(`SELECT count(*)::int AS n FROM ${queueSchema}.job`))
        .rows,
    ).toEqual(jobsBefore.rows)
  })

  it('deduplicates concurrent enqueue requests and creates only one real queue job', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => enqueueSync()),
    )
    expect(new Set(results.map((r) => r!.id)).size).toBe(1)
    expect(results.filter((r) => !r!.existing)).toHaveLength(1)
    const stored = (await pool.query('SELECT * FROM source_sync_runs')).rows
    expect(stored).toHaveLength(1)
    const job = await boss.getJobById(syncQueue, stored[0].job_id)
    expect(job?.data).toEqual({ runId: stored[0].id })
  })

  it('keeps unchanged snapshots once and records changes including reversion', async () => {
    const original = {
      jobOfferKey: 'one',
      title: 'PHP',
      unknown: { enum: 'future' },
    }
    expect((await run([original])).revisions).toBe(1)
    expect(
      (
        await run([
          { unknown: { enum: 'future' }, title: 'PHP', jobOfferKey: 'one' },
        ])
      ).revisions,
    ).toBe(0)
    expect((await run([{ ...original, title: 'Senior PHP' }])).revisions).toBe(
      1,
    )
    expect((await run([original])).revisions).toBe(1)
    expect((await pool.query('SELECT * FROM source_ads')).rowCount).toBe(1)
    expect(
      (await pool.query('SELECT * FROM source_ad_revisions')).rowCount,
    ).toBe(3)
    const current = await pool.query(
      'SELECT r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id',
    )
    expect(current.rows[0].payload).toEqual(original)
  })

  it('only a complete import marks disappearance and reappearance restores availability', async () => {
    await run([{ jobOfferKey: 'one' }, { jobOfferKey: 'two' }])
    await run([{ jobOfferKey: 'one' }])
    const missing = await pool.query(
      "SELECT availability FROM source_ads WHERE external_id='two'",
    )
    expect(missing.rows[0].availability).toBe('unavailable')
    await run([{ jobOfferKey: 'two' }])
    expect(
      (
        await pool.query(
          "SELECT availability FROM source_ads WHERE external_id='two'",
        )
      ).rows[0].availability,
    ).toBe('available')
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM source_ad_revisions r JOIN source_ads a ON a.id=r.source_ad_id WHERE a.external_id='two'",
        )
      ).rows[0].n,
    ).toBe(1)
  })

  it('retains a successful page and does not mark unseen ads unavailable after a page error', async () => {
    await run([{ jobOfferKey: 'old' }])
    const queued = await enqueueSync()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page([{ jobOfferKey: 'new' }], { totalCount: 2, totalPages: 2 }),
      )
      .mockRejectedValueOnce(
        new Error('API network error or timeout after retry'),
      )
    await executeSync(queued!.id, solidJobsWith(fetcher))
    const stored = (
      await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [
        queued!.id,
      ])
    ).rows[0]
    expect(stored.status).toBe('partial')
    expect(stored.pages).toBe(1)
    expect(
      (
        await pool.query(
          "SELECT external_id FROM source_ads WHERE availability='available' ORDER BY external_id",
        )
      ).rows,
    ).toEqual([{ external_id: 'new' }, { external_id: 'old' }])
  })

  it.each(['metadata', 'duplicate'])(
    'prevents false absence for unstable %s',
    async (kind) => {
      await run([{ jobOfferKey: 'old' }])
      const queued = await enqueueSync()
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          page([{ jobOfferKey: 'new' }], { totalCount: 2, totalPages: 2 }),
        )
        .mockResolvedValueOnce(
          kind === 'duplicate'
            ? page([{ jobOfferKey: 'new' }], { totalCount: 2, totalPages: 2 })
            : page([{ jobOfferKey: 'another' }], {
                totalCount: 3,
                totalPages: 2,
              }),
        )
      await executeSync(queued!.id, solidJobsWith(fetcher))
      expect(
        (
          await pool.query('SELECT status FROM source_sync_runs WHERE id=$1', [
            queued!.id,
          ])
        ).rows[0].status,
      ).toBe('partial')
      expect(
        (
          await pool.query(
            "SELECT availability FROM source_ads WHERE external_id='old'",
          )
        ).rows[0].availability,
      ).toBe('available')
    },
  )

  it('retains valid jobs from an invalid envelope and preserves explicit expiry separately', async () => {
    await run([{ jobOfferKey: 'old' }])
    const result = await run(
      [
        {
          jobOfferKey: 'expired',
          validTo: '2020-01-01T00:00:00Z',
          unknownField: 'retained',
        },
      ],
      { valid: false },
    )
    expect(result.status).toBe('partial')
    const stored = await pool.query(
      "SELECT availability,valid_to FROM source_ads WHERE external_id='expired'",
    )
    expect(stored.rows[0].availability).toBe('available')
    expect(stored.rows[0].valid_to.toISOString()).toBe(
      '2020-01-01T00:00:00.000Z',
    )
    expect(
      (
        await pool.query(
          "SELECT availability FROM source_ads WHERE external_id='old'",
        )
      ).rows[0].availability,
    ).toBe('available')
  })

  it('keeps an actively locked run intact during recovery and duplicate delivery', async () => {
    const queued = await enqueueSync()
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const execution = executeSync(
      queued!.id,
      solidJobsWith(async () => {
        entered()
        await gate
        return page([{ jobOfferKey: 'active' }])
      }),
    )
    await started
    try {
      await recoverSync()
      expect(
        (
          await pool.query('SELECT status FROM source_sync_runs WHERE id=$1', [
            queued!.id,
          ])
        ).rows[0].status,
      ).toBe('running')
      const duplicateFetch = vi.fn()
      await executeSync(queued!.id, solidJobsWith(duplicateFetch))
      expect(duplicateFetch).not.toHaveBeenCalled()
      expect(
        (
          await pool.query('SELECT status FROM source_sync_runs WHERE id=$1', [
            queued!.id,
          ])
        ).rows[0].status,
      ).toBe('running')
    } finally {
      release()
      await execution
    }
    expect(
      (
        await pool.query('SELECT status FROM source_sync_runs WHERE id=$1', [
          queued!.id,
        ])
      ).rows[0].status,
    ).toBe('complete')
  })

  // Since 0mq.5 a running run is orphaned when its queue job has ended, and
  // it ends partial by its saved ads (A5-R03, A5-R06).
  it('recovers orphaned running imports and ignores late delivery', async () => {
    const queued = await enqueueSync()
    const { rows } = await pool.query(
      "UPDATE source_sync_runs SET status='running',attempt=0,pages=1,seen=1 WHERE id=$1 RETURNING job_id",
      [queued!.id],
    )
    await boss.cancel(syncQueue, rows[0].job_id)
    await recoverSync()
    expect(
      (
        await pool.query('SELECT status FROM source_sync_runs WHERE id=$1', [
          queued!.id,
        ])
      ).rows[0].status,
    ).toBe('partial')
    const fetcher = vi.fn()
    await executeSync(queued!.id, solidJobsWith(fetcher))
    expect(fetcher).not.toHaveBeenCalled()
    expect((await enqueueSync())!.id).not.toBe(queued!.id)
  })

  it('stores ads with the identifiers, links, expiry, hashes and content from before connectors', async () => {
    const content = {
      jobOfferKey: 'pinned',
      url: 'https://solid.jobs/offer/pinned',
      validTo: '2027-01-31T23:59:59Z',
      title: 'Senior PHP',
      unknownField: { enum: 'future' },
    }
    expect((await run([content])).status).toBe('complete')
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
    ).toEqual([
      {
        external_id: 'pinned',
        url: 'https://solid.jobs/offer/pinned',
        valid_to: '2027-01-31T23:59:59.000Z',
        content_hash:
          '9bc31069b6c2c759fb30a4816ee1529d9f71d9978ff478ddaa815198df2f7f9e',
      },
    ])
  })

  it('retries a transient source failure inside the same run', async () => {
    const queued = await enqueueSync()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(
        Response.json({
          jobs: [{ jobOfferKey: 'retried' }],
          pageIndex: 0,
          pageSize: 100,
          totalCount: 1,
          totalPages: 1,
        }),
      )
    await executeSync(
      queued!.id,
      solidJobsWith(createPageFetcher(fetcher, async () => {})),
    )
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(
      (await pool.query('SELECT id,status,pages,seen FROM source_sync_runs'))
        .rows,
    ).toEqual([{ id: queued!.id, status: 'complete', pages: 1, seen: 1 }])
  })

  // Since 0mq.5 an incomplete run without saved ads is failed (A5-R03).
  it('counts an empty invalid first page, and the run without saved ads fails', async () => {
    const result = await run([], { valid: false, totalCount: 5, totalPages: 1 })
    expect(result).toMatchObject({
      status: 'failed',
      pages: 1,
      seen: 0,
      error:
        'Invalid or changing pagination; saved valid offers, availability unchanged',
    })
  })

  it('makes one catchup slot after downtime and does not enqueue every missed day', async () => {
    const now = new Date('2026-10-31T12:00:00Z')
    const [queued] = await requestScheduledSyncs({ now })
    await executeSync(
      queued!.id,
      solidJobsWith(async () => page([])),
    )
    expect(await requestScheduledSyncs({ now })).toEqual([])
    expect(
      (
        await pool.query(
          'SELECT schedule_day::text AS day FROM source_sync_runs',
        )
      ).rows,
    ).toEqual([{ day: '2026-10-31' }])
  })
})
