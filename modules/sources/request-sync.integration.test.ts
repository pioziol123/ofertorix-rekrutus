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
import { closePool, setPool } from '../../lib/db.ts'
import { createPolishConnector } from './infrastructure/adapters/polish/connector.ts'
import {
  readSourceCatalog,
  readSyncState,
  recoverSyncRuns,
  requestScheduledSyncs,
  requestSync,
  SourceDisabledError,
  syncQueue,
  syncQueueOptions,
  UnknownConnectorError,
  useSyncQueue,
  waitForSyncRun,
  workSyncQueue,
} from './index.ts'
import type {
  BatchReceiver,
  ConnectorResult,
  ScopeParameters,
  SourceConnector,
} from './infrastructure/adapters/connector.ts'
import { toConnectorAd } from './infrastructure/adapters/connector.ts'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'
import { createHimalayasConnector } from './infrastructure/adapters/himalayas/connector.ts'
import { finishRun, readRun, startRun } from './sync-run-state.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

type Fetch = (
  parameters: ScopeParameters,
  onBatch: BatchReceiver,
  signal: AbortSignal,
) => Promise<ConnectorResult>

/**
 * A simulated source. Its scope is the request's keyword (PHP by default)
 * and the current setting `limit`; `scheduled` makes it a scheduled source.
 */
function simulated(
  name: string,
  options: {
    fetch?: Fetch
    scheduled?: boolean
    enabled?: () => boolean
    settings?: { limit: number }
  } = {},
): SourceConnector {
  const settings = options.settings ?? { limit: 50 }
  return {
    name,
    infersUnavailabilityFromAbsence: false,
    scheduled: options.scheduled ?? false,
    enabled: options.enabled ?? (() => true),
    scopeParameters: (request) => ({
      source: name,
      keyword: (request as { keyword?: string } | undefined)?.keyword ?? 'PHP',
      limit: settings.limit,
    }),
    fetch:
      options.fetch ??
      (async (_, onBatch) => {
        await onBatch([toConnectorAd({ jobOfferKey: `${name}-one` })])
        return { complete: true }
      }),
  }
}

integration('shared sync requesting and queue (0mq.16)', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `sync_request_${suffix}`
  const queueSchema = `sync_req_q_${suffix}`
  let admin: Pool
  let pool: Pool
  let boss: PgBoss
  const workers: PgBoss[] = []

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 16,
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
    await admin.query(`DELETE FROM ${queueSchema}.job`)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(workers.splice(0).map((worker) => worker.stop()))
  })

  afterAll(async () => {
    await boss?.stop()
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })

  const runs = async () =>
    (
      await pool.query(
        `SELECT r.id, r.status, r.trigger, r.job_id, r.schedule_day::text AS day,
          s.source, s.parameters FROM source_sync_runs r
        JOIN source_scopes s ON s.id=r.scope_id ORDER BY r.created_at, r.id`,
      )
    ).rows
  const jobs = async () =>
    (
      await admin.query(
        `SELECT id, data, group_id FROM ${queueSchema}.job WHERE name=$1`,
        [syncQueue],
      )
    ).rows

  /** A worker process: its own pg-boss client working the sync queue. */
  async function startWorker(connectors: ReturnType<typeof registry>) {
    const worker = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
    })
    worker.on('error', () => {})
    await worker.start()
    workers.push(worker)
    await workSyncQueue(worker, connectors)
  }
  const registry = (...connectors: SourceConnector[]) =>
    createConnectorRegistry(connectors)

  describe('the request operation', () => {
    it('creates one pending run and one job for concurrent requests of a scope, all pointing at it (A16-AC01)', async () => {
      const connectors = registry(simulated('sim-a'))
      const requests = await Promise.all(
        Array.from({ length: 10 }, () =>
          requestSync({ source: 'sim-a' }, { connectors }),
        ),
      )
      expect(new Set(requests.map((r) => r.id)).size).toBe(1)
      expect(requests.filter((r) => !r.existing)).toHaveLength(1)
      const [run] = await runs()
      expect(await runs()).toHaveLength(1)
      expect(run).toMatchObject({ status: 'queued', trigger: 'manual' })
      // No run without a job and no job without a run.
      expect(await jobs()).toEqual([
        { id: run.job_id, data: { runId: run.id }, group_id: 'sim-a' },
      ])
    })

    it('creates one pending run next to a run in progress and points later requests at it, without interrupting the run (A16-AC02)', async () => {
      const connectors = registry(simulated('sim-a'))
      const first = await requestSync({ source: 'sim-a' }, { connectors })
      const running = await startRun(first.id, { jobId: null, attempt: 0 })
      const [pending, ...later] = await Promise.all(
        Array.from({ length: 5 }, () =>
          requestSync({ source: 'sim-a' }, { connectors }),
        ),
      )
      const created = [pending!, ...later].filter((r) => !r.existing)
      expect(created).toHaveLength(1)
      for (const request of later) expect(request.id).toBe(created[0]!.id)
      expect(pending!.id).toBe(created[0]!.id)
      expect(await readRun(first.id)).toEqual(running)
      expect((await runs()).map((r) => r.status)).toEqual(['running', 'queued'])
      expect(await jobs()).toHaveLength(2)
    })

    it('returns the run id at once, before any worker executes it (A16-AC05)', async () => {
      const connectors = registry(simulated('sim-a'))
      const request = await requestSync({ source: 'sim-a' }, { connectors })
      expect(request).toEqual({ id: expect.any(String), existing: false })
      expect((await readRun(request.id))!.status).toBe('queued')
    })

    it('fixes the settings at the request and puts equivalent requests of the CLI and the application in one scope (A16-AC06)', async () => {
      const settings = { limit: 50 }
      const connectors = registry(simulated('sim-a', { settings }))
      const requested = await requestSync({ source: 'sim-a' }, { connectors })
      settings.limit = 100
      expect((await readRun(requested.id))!.parameters).toEqual({
        source: 'sim-a',
        keyword: 'PHP',
        limit: 50,
      })
      // A different result limit is a different scope (F2-08).
      const larger = await requestSync({ source: 'sim-a' }, { connectors })
      expect(larger.existing).toBe(false)

      // The Polish portal CLI passes every option; the application sends
      // only some, in another order. Both are the same scope.
      vi.stubEnv('POLISH_SOURCES', 'bulldogjob')
      const polish = registry(createPolishConnector('bulldogjob'))
      const cli = await requestSync(
        {
          source: 'bulldogjob',
          scopeRequest: {
            source: 'bulldogjob',
            technology: 'PHP',
            seniority: 'senior',
            maxOffers: 50,
            maxPages: 5,
            maxRequests: 60,
            maxSeconds: 150,
          },
        },
        { connectors: polish },
      )
      const application = await requestSync(
        {
          source: 'bulldogjob',
          scopeRequest: { seniority: 'senior', source: 'bulldogjob' },
        },
        { connectors: polish },
      )
      expect(application).toEqual({ id: cli.id, existing: true })
    })

    it('refuses an unknown or disabled source and creates nothing', async () => {
      const connectors = registry(simulated('sim-a', { enabled: () => false }))
      await expect(
        requestSync({ source: 'sim-unknown' }, { connectors }),
      ).rejects.toBeInstanceOf(UnknownConnectorError)
      await expect(
        requestSync({ source: 'sim-a' }, { connectors }),
      ).rejects.toBeInstanceOf(SourceDisabledError)
      expect(await runs()).toEqual([])
      expect(await jobs()).toEqual([])
    })
  })

  describe('the schedule', () => {
    // 2026-11-18 09:00 in Warsaw, after the default schedule hour 08:00.
    const now = new Date('2026-11-18T08:00:00Z')
    const scheduled = () =>
      registry(
        simulated('sim-scheduled', { scheduled: true }),
        simulated('sim-a'),
      )

    it('creates one request per occurrence however many times and however parallel it is checked (A16-AC04)', async () => {
      const connectors = scheduled()
      const cycles = await Promise.all(
        Array.from({ length: 5 }, () =>
          requestScheduledSyncs({ connectors, now }),
        ),
      )
      expect(cycles.flat()).toHaveLength(1)
      const [run] = await runs()
      await finishRun(run.id, { status: 'complete', error: null })
      expect(await requestScheduledSyncs({ connectors, now })).toEqual([])
      expect(
        await requestScheduledSyncs({
          connectors,
          now: new Date('2026-11-18T20:00:00Z'),
        }),
      ).toEqual([])
      expect(await runs()).toEqual([
        expect.objectContaining({
          source: 'sim-scheduled',
          trigger: 'scheduled',
          day: '2026-11-18',
        }),
      ])
      // The next day's occurrence requests again.
      expect(
        await requestScheduledSyncs({
          connectors,
          now: new Date('2026-11-19T08:00:00Z'),
        }),
      ).toHaveLength(1)
    })

    it('is not held back by a manual request of the same day, and a second manual request that day follows F2-07 (A16-AC04)', async () => {
      const connectors = scheduled()
      const manual = await requestSync(
        { source: 'sim-scheduled' },
        { connectors, now },
      )
      await finishRun(manual.id, { status: 'complete', error: null })
      const [occurrence] = await requestScheduledSyncs({ connectors, now })
      expect(occurrence).toEqual({ id: expect.any(String), existing: false })
      // A second manual request points at the scheduled pending run …
      expect(
        await requestSync({ source: 'sim-scheduled' }, { connectors, now }),
      ).toEqual({ id: occurrence!.id, existing: true })
      // … and once it has finished, creates a new run the same day (F2-09).
      await finishRun(occurrence!.id, { status: 'complete', error: null })
      const again = await requestSync(
        { source: 'sim-scheduled' },
        { connectors, now },
      )
      expect(again.existing).toBe(false)
      expect((await runs()).map((r) => [r.trigger, r.day])).toEqual([
        ['manual', '2026-11-18'],
        ['scheduled', '2026-11-18'],
        ['manual', '2026-11-18'],
      ])
    })

    it('creates the occurrence run only after a pending manual run it met has started (0mq.16 ASM-1)', async () => {
      const connectors = scheduled()
      const manual = await requestSync(
        { source: 'sim-scheduled' },
        { connectors, now },
      )
      // The occurrence's request is pointed at the pending manual run and
      // creates nothing, however often it is checked.
      expect(await requestScheduledSyncs({ connectors, now })).toEqual([
        { id: manual.id, existing: true },
      ])
      await requestScheduledSyncs({ connectors, now })
      expect(await runs()).toHaveLength(1)
      // Once that run has started, the occurrence gets its own run, once.
      await startRun(manual.id, { jobId: null, attempt: 0 })
      const [own] = await requestScheduledSyncs({ connectors, now })
      expect(own).toEqual({ id: expect.any(String), existing: false })
      expect(await requestScheduledSyncs({ connectors, now })).toEqual([])
      expect((await runs()).map((r) => [r.trigger, r.status])).toEqual([
        ['manual', 'running'],
        ['scheduled', 'queued'],
      ])
    })
  })

  it('executes runs of one source one at a time in request order, also in different scopes, and different sources in parallel, with two workers (A16-AC03, 0mq.16 ASM-3)', async () => {
    const spans: {
      source: string
      keyword: unknown
      start: number
      end: number
    }[] = []
    const recording = (source: string) =>
      simulated(source, {
        fetch: async (parameters) => {
          const start = Date.now()
          await new Promise((resolve) => setTimeout(resolve, 700))
          spans.push({
            source,
            keyword: parameters.keyword,
            start,
            end: Date.now(),
          })
          return { complete: true }
        },
      })
    const connectors = registry(recording('sim-a'), recording('sim-b'))
    const order = ['PHP', 'Java', 'Go', 'Rust']
    const requested: string[] = []
    for (const keyword of order) {
      requested.push(
        (
          await requestSync(
            { source: 'sim-a', scopeRequest: { keyword } },
            { connectors },
          )
        ).id,
      )
      // Distinct creation times keep the request order unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const other = await requestSync({ source: 'sim-b' }, { connectors })
    await startWorker(connectors)
    await startWorker(connectors)

    for (const id of [...requested, other.id])
      expect((await waitForSyncRun(id, { intervalMs: 100 })).status).toBe(
        'complete',
      )

    const a = spans.filter((s) => s.source === 'sim-a')
    expect(a.map((s) => s.keyword)).toEqual(order)
    for (let i = 1; i < a.length; i++)
      expect(a[i]!.start).toBeGreaterThanOrEqual(a[i - 1]!.end)
    const b = spans.find((s) => s.source === 'sim-b')!
    expect(a.some((s) => s.start < b.end && b.start < s.end)).toBe(true)
  }, 60_000)

  it('requests Himalayas to the queue and has a worker execute it (A16-AC07)', async () => {
    const connectors = registry(
      createHimalayasConnector(async () => ({
        jobs: [],
        valid: true,
        totalCount: 0,
        rejected: 0,
        missingDescriptions: 0,
      })),
    )
    const request = await requestSync({ source: 'himalayas' }, { connectors })
    const [job] = await jobs()
    expect(job).toMatchObject({
      data: { runId: request.id },
      group_id: 'himalayas',
    })
    await startWorker(connectors)
    expect(await waitForSyncRun(request.id, { intervalMs: 100 })).toMatchObject(
      { status: 'complete', jobId: job.id, attempt: 0 },
    )
  }, 30_000)

  it('keeps a pending run queued, using no attempt, while a run of its scope still runs after its job failed, then executes it (F2-07, 0mq.16 ASM-3)', async () => {
    const connectors = registry(simulated('sim-a'))
    const a = await requestSync({ source: 'sim-a' }, { connectors })
    const aJob = (await readRun(a.id))!.jobId!
    await startRun(a.id, { jobId: aJob, attempt: 0 })
    // A's job used up its attempts; recovery has not ended A yet.
    await admin.query(
      `UPDATE ${queueSchema}.job SET state='failed' WHERE id=$1`,
      [aJob],
    )
    const b = await requestSync({ source: 'sim-a' }, { connectors })
    expect(b.existing).toBe(false)
    const bJob = (await readRun(b.id))!.jobId!
    await startWorker(connectors)

    await new Promise((resolve) => setTimeout(resolve, 4000))
    expect((await readRun(b.id))!.status).toBe('queued')
    const { rows } = await admin.query(
      `SELECT state, retry_count FROM ${queueSchema}.job WHERE id=$1`,
      [bJob],
    )
    expect(rows[0]).toEqual({ state: 'active', retry_count: 0 })

    await recoverSyncRuns()
    expect((await readRun(a.id))!.status).toBe('failed')
    expect(await waitForSyncRun(b.id, { intervalMs: 100 })).toMatchObject({
      status: 'complete',
      jobId: bJob,
      attempt: 0,
    })
  }, 30_000)

  it('ends a run pending in a per-source queue of before 0mq.16 with a message about the interruption (A16-AC09)', async () => {
    const legacyQueue = 'source-solid-jobs'
    await boss.createQueue(legacyQueue)
    const legacyJob = await boss.send(legacyQueue, { runId: 'unused' })
    const { rows } = await pool.query(
      `WITH scope AS (
        INSERT INTO source_scopes(id,source,fingerprint,parameters)
        VALUES (gen_random_uuid(),'solid-jobs','legacy','{}') RETURNING id
      ) INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day,job_id)
        SELECT gen_random_uuid(), id, 'manual', '2026-11-18', $1 FROM scope
        RETURNING id`,
      [legacyJob],
    )
    await recoverSyncRuns()
    expect(await readRun(rows[0].id)).toMatchObject({
      status: 'failed',
      error: 'Queue delivery ended; request a new import',
    })
  })

  it('waits for a run with no time limit, longer than the earlier 120 s (A16-AC05)', async () => {
    const connectors = registry(simulated('sim-a'))
    const { id } = await requestSync({ source: 'sim-a' }, { connectors })
    let pauses = 0
    const finished = await waitForSyncRun(id, {
      // Each pause stands for the 1 s between reads; after 300 of them the
      // run finishes.
      sleep: async () => {
        pauses++
        if (pauses === 300)
          await finishRun(id, { status: 'partial', error: null })
      },
    })
    expect(pauses).toBe(300)
    expect(finished).toMatchObject({ id, status: 'partial' })
  })

  it('reads source and run state in the form the application has always shown (A16-AC08)', async () => {
    vi.stubEnv('POLISH_SOURCES', 'bulldogjob')
    const { id } = await requestSync({
      source: 'bulldogjob',
      scopeRequest: { source: 'bulldogjob' },
    })
    await finishRun(id, { status: 'complete', error: null })
    const columns = Object.keys(
      (await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [id]))
        .rows[0],
    )
    const catalog = await readSourceCatalog()
    expect(Object.keys(catalog.polish)).toEqual(['scheduled', 'sources'])
    expect(Object.keys(catalog.jobspy)).toEqual([
      'enabled',
      'scheduled',
      'run',
      'sources',
    ])
    const bulldogjob = catalog.polish.sources.find(
      (s) => s.source === 'bulldogjob',
    )!
    expect(Object.keys(bulldogjob)).toEqual([
      'source',
      'name',
      'host',
      'connected',
      'enabled',
      'scheduled',
      'run',
    ])
    expect(bulldogjob).toMatchObject({
      enabled: true,
      scheduled: false,
      connected: true,
    })
    expect(Object.keys(bulldogjob.run!)).toEqual(columns)
    expect(Object.keys(catalog.jobspy.sources[0]!)).toEqual([
      'source',
      'name',
      'prefix',
      'hosts',
      'scope',
      'restriction',
      'reason',
      'connected',
      'enabled',
      'scheduled',
      'run',
    ])

    // The SOLID.Jobs state reads its scope; the run carries its parameters.
    const solid = await requestSync({ source: 'solid-jobs' })
    await finishRun(solid.id, { status: 'complete', error: null })
    const state = await readSyncState({
      source: 'solid-jobs',
      runId: solid.id,
      scope: {},
    })
    expect(Object.keys(state.run!)).toEqual([...columns, 'parameters'])
    expect(state.lastComplete).toEqual({
      id: solid.id,
      finished_at: expect.any(Date),
    })
    expect(
      (await readSyncState({ source: 'bulldogjob', runId: solid.id })).run,
    ).toBeNull()
  })
})
