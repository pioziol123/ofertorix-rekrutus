import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { setPool } from '../lib/db.ts'
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
  enqueueJobspy,
  jobspyStatus,
  jobspyCatalogStatus,
} from '../lib/sources/jobspy-sync.ts'
import { jobspyQueue, queueFor } from '../lib/sources/jobspy.ts'
import { enqueueSync } from '../lib/sources/sync.ts'
import { hash, importQueue } from '../lib/sources/solid.ts'
import { readOffers } from '../modules/offers/read-offers.ts'
import { job, result, sourceResult } from './fixtures/jobspy/result.ts'
import { jobspyWith, solidJobsWith } from './source-connectors.fixtures.ts'
import { deliver, recover } from './sync-run.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('offline JobSpy persistence and real pg-boss delivery', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `jobspy_test_${suffix}`
  const queueSchema = `jobspy_queue_${suffix}`
  let admin: Pool, pool: Pool, boss: PgBoss
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
    for (const migration of [
      '1770000000001_sources',
      '1770000000005_jobspy',
      '1770000000014_sync_run_state',
      '1770000000015_sync_run_attempt',
    ]) {
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
    await boss.createQueue(importQueue, { retryLimit: 0 })
    await boss.createQueue(jobspyQueue, { retryLimit: 0 })
    await boss.createQueue(queueFor('linkedin'), { retryLimit: 0 })
    await boss.createQueue(queueFor('bayt'), { retryLimit: 0 })
  }, 30000)
  beforeEach(async () => {
    vi.stubEnv('JOBSPY_ENABLED', 'true')
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
  const stored = async (id: string) =>
    (await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [id]))
      .rows[0]
  async function run(overrides: Record<string, unknown> = {}) {
    const queued = await enqueueJobspy(boss)
    await deliver(
      queued.id,
      jobspyWith(async () => result(overrides), 'indeed'),
    )
    return stored(queued.id)
  }

  it('rolls back both queue delivery and scope/run if enqueue fails after inserting delivery', async () => {
    const before = (
      await admin.query(`SELECT count(*)::int AS n FROM ${queueSchema}.job`)
    ).rows
    const original = boss.send.bind(boss)
    const spy = vi
      .spyOn(boss, 'send')
      .mockImplementationOnce(async (name, data, options) => {
        await original(name, data, options)
        throw new Error('synthetic dispatch failure')
      })
    try {
      await expect(enqueueJobspy(boss)).rejects.toThrow(
        'synthetic dispatch failure',
      )
    } finally {
      spy.mockRestore()
    }
    expect((await pool.query('SELECT * FROM source_sync_runs')).rowCount).toBe(
      0,
    )
    expect((await pool.query('SELECT * FROM source_scopes')).rowCount).toBe(0)
    expect(
      (await admin.query(`SELECT count(*)::int AS n FROM ${queueSchema}.job`))
        .rows,
    ).toEqual(before)
  })
  it('deduplicates concurrent requests into one real queue delivery', async () => {
    const queued = await Promise.all(
      Array.from({ length: 5 }, () => enqueueJobspy(boss)),
    )
    expect(new Set(queued.map((q) => q.id)).size).toBe(1)
    expect(queued.filter((q) => !q.reused)).toHaveLength(1)
    const row = await stored(queued[0]!.id)
    expect((await boss.getJobById(jobspyQueue, row.job_id))?.data).toEqual({
      runId: row.id,
    })
    expect(row.trigger).toBe('manual')
  })
  it('records unchanged content once, then change and reversion as distinct revisions', async () => {
    expect((await run()).revisions).toBe(1)
    expect(
      (
        await run({
          started_at: '2026-11-03T10:00:00Z',
          finished_at: '2026-11-03T10:01:00Z',
        })
      ).revisions,
    ).toBe(0)
    expect(
      (await run({ jobs: [job({ title: 'Changed role' })] })).revisions,
    ).toBe(1)
    expect((await run()).revisions).toBe(1)
    expect(
      (await pool.query('SELECT * FROM source_ad_revisions')).rowCount,
    ).toBe(3)
    const view = (await readOffers())[0]!
    expect(view).toMatchObject({
      source: 'Indeed',
      title: 'PHP engineer',
      mode: null,
      salaries: [{ origin: 'portal_estimate' }],
    })
    expect(
      (await pool.query('SELECT external_id FROM source_ads')).rows,
    ).toEqual([{ external_id: 'ab123' }])
  })
  it('stores ads with the identifiers, links, expiry, hashes and content from before connectors', async () => {
    expect((await run()).status).toBe('complete')
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
        external_id: 'ab123',
        url: 'https://pl.indeed.com/viewjob?jk=ab123',
        valid_to: null,
        content_hash:
          'ec649f38b03cdf598c90c2d231c0fe4fbbd8ff6a1d428be9674cfa18e08624fa',
      },
    ])
  })
  // Since 0mq.5 an incomplete run without saved ads is failed, whatever the
  // helper status (A5-R03).
  it.each([
    ['limited', 'failed', 'unverified'],
    ['partial', 'failed', 'page_error'],
    ['failed', 'failed', 'page_error'],
  ])(
    'fails an incomplete run without jobs: helper %s gives %s',
    async (status, expected, stop_reason) => {
      expect(await run({ status, stop_reason, jobs: [] })).toMatchObject({
        status: expected,
        seen: 0,
        error: 'JobSpy query incomplete; inspect source diagnostics',
      })
    },
  )

  it('never marks unseen offers unavailable after complete empty or partial queries', async () => {
    await run()
    expect((await run({ jobs: [] })).status).toBe('complete')
    await run({
      status: 'partial',
      stop_reason: 'page_error',
      jobs: [job({ id: 'in-new' })],
    })
    expect(
      (
        await pool.query(
          'SELECT availability,valid_to FROM source_ads ORDER BY external_id',
        )
      ).rows,
    ).toEqual([
      { availability: 'available', valid_to: null },
      { availability: 'available', valid_to: null },
    ])
  })
  it('stores diagnostics with valid offers despite malformed records, excluding raw jobs', async () => {
    const row = await run({
      status: 'limited',
      stop_reason: 'request_limit',
      request_count: 4,
      jobs: [job(), null, job()],
    })
    expect(row).toMatchObject({
      status: 'partial',
      seen: 1,
      diagnostics: {
        request_count: 4,
        rejected: 1,
        duplicates: 1,
        stop_reason: 'request_limit',
      },
    })
    expect(row.diagnostics).not.toHaveProperty('jobs')
    expect(await jobspyStatus(pool, row.id)).toMatchObject({
      enabled: true,
      scheduled: false,
      run: { id: row.id, status: 'partial' },
    })
  })
  it('keeps a running import intact during recovery and concurrent delivery, ignoring late delivery', async () => {
    const queued = await enqueueJobspy(boss)
    let entered!: () => void, release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const execution = deliver(
      queued.id,
      jobspyWith(async () => {
        entered()
        await gate
        return result()
      }, 'indeed'),
    )
    await started
    try {
      await recover(boss)
      const duplicate = vi.fn()
      await deliver(queued.id, jobspyWith(duplicate, 'indeed'))
      expect(duplicate).not.toHaveBeenCalled()
      expect((await stored(queued.id)).status).toBe('running')
    } finally {
      release()
      await execution
    }
    const late = vi.fn()
    await deliver(queued.id, jobspyWith(late, 'indeed'))
    expect(late).not.toHaveBeenCalled()
    expect((await stored(queued.id)).status).toBe('complete')
  })
  // Since 0mq.5 one recovery serves every source and ends only runs whose
  // queue job has ended (A5-R06).
  it('recovers a run only when its own queue job has ended and permits a fresh JobSpy run', async () => {
    const indeed = await enqueueJobspy(boss)
    const solid = (await enqueueSync(boss))!
    await pool.query("UPDATE source_sync_runs SET status='running'")
    await boss.cancel(importQueue, (await stored(solid.id)).job_id)
    await recover(boss)
    expect((await stored(indeed.id)).status).toBe('running')
    expect((await stored(solid.id)).status).toBe('failed')
    await boss.cancel(jobspyQueue, (await stored(indeed.id)).job_id)
    await recover(boss)
    expect((await stored(indeed.id)).status).toBe('failed')
    expect((await enqueueJobspy(boss)).id).not.toBe(indeed.id)
    const late = vi.fn()
    await deliver(indeed.id, jobspyWith(late, 'indeed'))
    expect(late).not.toHaveBeenCalled()
  })
  // Since 0mq.5 the shared executor runs the delivered run with its own
  // source's connector; the queue no longer selects the source (A5-R01).
  it('never merges an identical external ID across sources', async () => {
    const solid = (await enqueueSync(boss))!
    await deliver(
      solid.id,
      solidJobsWith(async () => ({
        jobs: [{ jobOfferKey: 'ab123', title: 'SOLID offer' }],
        valid: true,
        totalCount: 1,
        totalPages: 1,
      })),
    )
    await run()
    expect(
      (
        await pool.query(
          'SELECT source,external_id FROM source_ads ORDER BY source',
        )
      ).rows,
    ).toEqual([
      { source: 'indeed', external_id: 'ab123' },
      { source: 'solid-jobs', external_id: 'ab123' },
    ])
  })
  it('redacts arbitrary collector exceptions and rejects disabled execution without invoking collection', async () => {
    const queued = await enqueueJobspy(boss)
    await deliver(
      queued.id,
      jobspyWith(async () => {
        throw new Error('secret token from scraper')
      }, 'indeed'),
    )
    // Since 0mq.5 the shared executor stores one generic message (A5-R01).
    expect(await stored(queued.id)).toMatchObject({
      status: 'failed',
      error: 'Import interrupted by a storage or processing error',
    })
    const next = await enqueueJobspy(boss)
    vi.stubEnv('JOBSPY_ENABLED', 'false')
    const collector = vi.fn()
    await deliver(next.id, jobspyWith(collector, 'indeed'))
    expect(collector).not.toHaveBeenCalled()
    expect(await stored(next.id)).toMatchObject({
      status: 'failed',
      error: 'JobSpy source is disabled',
    })
  })
  it('recovers queued imports whose actual queue delivery has ended', async () => {
    const queued = await enqueueJobspy(boss)
    const row = await stored(queued.id)
    await boss.cancel(jobspyQueue, row.job_id)
    await recover(boss)
    expect((await stored(queued.id)).status).toBe('failed')
  })
  it('deduplicates across parameter scopes and rejects a stale scope before collection', async () => {
    const queued = await enqueueJobspy(boss)
    const row = await stored(queued.id)
    await pool.query(
      "UPDATE source_scopes SET fingerprint='old-parameters',parameters='{}'::jsonb WHERE id=$1",
      [row.scope_id],
    )
    expect(await enqueueJobspy(boss)).toEqual({
      id: queued.id,
      reused: true,
    })
    const collector = vi.fn()
    await deliver(queued.id, jobspyWith(collector, 'indeed'))
    expect(collector).not.toHaveBeenCalled()
    expect(await stored(queued.id)).toMatchObject({
      status: 'failed',
      error: 'Invalid JobSpy result',
    })
  })
  it('retains valid records from a failed query as partial, never as complete', async () => {
    const row = await run({ status: 'failed', stop_reason: 'transport_error' })
    expect(row).toMatchObject({
      status: 'partial',
      seen: 1,
      diagnostics: { status: 'failed', stop_reason: 'transport_error' },
    })
    expect((await pool.query('SELECT * FROM source_ads')).rowCount).toBe(1)
  })
  it('isolates concurrent LinkedIn and Bayt delivery, recovery, identity and status', async () => {
    vi.stubEnv('JOBSPY_SOURCES', 'linkedin,bayt')
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'true')
    const [linkedin, bayt] = await Promise.all([
      enqueueJobspy(boss, new Date(), 'linkedin'),
      enqueueJobspy(boss, new Date(), 'bayt'),
    ])
    expect(linkedin.id).not.toBe(bayt.id)
    const linkedinRow = await stored(linkedin.id)
    const baytRow = await stored(bayt.id)
    expect(
      await boss.getJobById(queueFor('linkedin'), linkedinRow.job_id),
    ).toMatchObject({ data: { runId: linkedin.id } })
    expect(
      await boss.getJobById(queueFor('bayt'), baytRow.job_id),
    ).toMatchObject({ data: { runId: bayt.id } })

    let entered!: () => void, release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const execution = deliver(
      linkedin.id,
      jobspyWith(async () => {
        entered()
        await gate
        return sourceResult('linkedin')
      }, 'linkedin'),
    )
    await started
    try {
      await recover(boss)
      await recover(boss)
      expect((await stored(linkedin.id)).status).toBe('running')
      await deliver(
        bayt.id,
        jobspyWith(async () => sourceResult('bayt'), 'bayt'),
      )
      expect(await stored(bayt.id)).toMatchObject({
        status: 'partial',
        seen: 1,
      })
    } finally {
      release()
      await execution
    }
    expect(
      (
        await pool.query(
          'SELECT source,external_id FROM source_ads ORDER BY source',
        )
      ).rows,
    ).toEqual([
      { source: 'bayt', external_id: 'ab123' },
      { source: 'linkedin', external_id: 'ab123' },
    ])
    expect(await jobspyStatus(pool, linkedin.id, 'bayt')).toMatchObject({
      run: null,
    })
    const catalog = await jobspyCatalogStatus(pool)
    expect(catalog.sources.find((s) => s.source === 'linkedin')).toMatchObject({
      run: { id: linkedin.id, seen: 1 },
    })
    expect(catalog.sources.find((s) => s.source === 'bayt')).toMatchObject({
      run: { id: bayt.id, seen: 1 },
    })
    const next = await enqueueJobspy(boss, new Date(), 'bayt')
    await pool.query(
      "UPDATE source_sync_runs SET status='running' WHERE id=ANY($1::uuid[])",
      [[linkedin.id, next.id]],
    )
    await recover(boss)
    expect((await stored(next.id)).status).toBe('running')
    await boss.cancel(queueFor('bayt'), (await stored(next.id)).job_id)
    await recover(boss)
    expect((await stored(next.id)).status).toBe('failed')
    expect((await stored(linkedin.id)).status).toBe('running')
  })
})
