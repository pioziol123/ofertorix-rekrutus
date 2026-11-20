import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
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
import { stopQueues } from '../../lib/queues/index.ts'
import {
  deliver,
  prepareSyncRunQueue,
  sourcesMigrations,
} from '../../tests/sync-run.fixtures.ts'
import { createPolishConnector } from './infrastructure/adapters/polish/connector.ts'
import {
  readSourceCatalog,
  readSyncState,
  requestScheduledSyncs,
  requestSync,
  SourceDisabledError,
  syncJob,
  UnknownConnectorError,
  waitForSyncRun,
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

integration('shared sync requesting through the queue library', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `sync_request_${suffix}`
  const queueSchema = `sync_req_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 16,
    })
    for (const migration of sourcesMigrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    setPool(pool)
    await prepareSyncRunQueue(queueSchema)
    process.env.PG_BOSS_SCHEMA = queueSchema
  }, 30_000)

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
    await admin.query(`DELETE FROM ${queueSchema}.job`)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    await stopQueues()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
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
        `SELECT r.id, r.status, r.trigger, r.schedule_day::text AS day,
          s.source, s.parameters FROM source_sync_runs r
        JOIN source_scopes s ON s.id=r.scope_id ORDER BY r.created_at, r.id`,
      )
    ).rows
  const jobs = async () =>
    (
      await admin.query(
        `SELECT data, singleton_key FROM ${queueSchema}.job WHERE name=$1
        ORDER BY created_on`,
        [syncJob.queue],
      )
    ).rows
  const registry = (...connectors: SourceConnector[]) =>
    createConnectorRegistry(connectors)

  describe('the request operation', () => {
    it('creates one pending run and one job for concurrent requests of a source, all pointing at it (A16-AC01, B5-AC02)', async () => {
      const connectors = registry(simulated('sim-a'))
      const requests = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          requestSync(
            // Some of them for another scope of the same source.
            {
              source: 'sim-a',
              scopeRequest: { keyword: i % 3 ? 'PHP' : 'Go' },
            },
            { connectors },
          ),
        ),
      )
      expect(new Set(requests.map((r) => r.id)).size).toBe(1)
      expect(requests.filter((r) => !r.existing)).toHaveLength(1)
      const [run] = await runs()
      expect(await runs()).toHaveLength(1)
      expect(run).toMatchObject({ status: 'queued', trigger: 'manual' })
      // No run without a job and no job without a run.
      expect(await jobs()).toEqual([
        { data: { runId: run.id, source: 'sim-a' }, singleton_key: 'sim-a' },
      ])
    })

    it.each(['queued', 'running'] as const)(
      'returns the source’s %s run for a request of the same and of another scope and creates no run or job (B5-AC02)',
      async (status) => {
        const connectors = registry(simulated('sim-a'))
        const first = await requestSync({ source: 'sim-a' }, { connectors })
        const running = status === 'running' ? await startRun(first.id) : null
        const before = { runs: await runs(), jobs: await jobs() }
        for (const keyword of ['PHP', 'Java'])
          expect(
            await requestSync(
              { source: 'sim-a', scopeRequest: { keyword } },
              { connectors },
            ),
          ).toEqual({ id: first.id, existing: true })
        expect(await runs()).toEqual(before.runs)
        expect((await runs()).map((r) => r.status)).toEqual([status])
        expect(await jobs()).toEqual(before.jobs)
        expect(await jobs()).toHaveLength(1)
        // A request does not interrupt the run in progress.
        if (running) expect(await readRun(first.id)).toEqual(running)
      },
    )

    it('creates a run and a job for each of two sources (B5-AC02)', async () => {
      const connectors = registry(simulated('sim-a'), simulated('sim-b'))
      const [a, b] = await Promise.all([
        requestSync({ source: 'sim-a' }, { connectors }),
        requestSync({ source: 'sim-b' }, { connectors }),
      ])
      expect(a!.existing || b!.existing).toBe(false)
      expect(a!.id).not.toBe(b!.id)
      expect((await jobs()).map((job) => job.singleton_key).sort()).toEqual([
        'sim-a',
        'sim-b',
      ])
    })

    it('returns the run id at once, before any worker executes it (A16-AC05, B5-AC01)', async () => {
      const connectors = registry(simulated('sim-a'))
      const request = await requestSync({ source: 'sim-a' }, { connectors })
      expect(request).toEqual({ id: expect.any(String), existing: false })
      expect((await readRun(request.id))!.status).toBe('queued')
      expect(await jobs()).toEqual([
        {
          data: { runId: request.id, source: 'sim-a' },
          singleton_key: 'sim-a',
        },
      ])
    })

    it('fixes the settings at the request and puts equivalent requests of the CLI and the application in one scope (A16-AC06)', async () => {
      const settings = { limit: 50 }
      const connectors = registry(simulated('sim-a', { settings }))
      const requested = await requestSync({ source: 'sim-a' }, { connectors })
      settings.limit = 100
      const fixed = await readRun(requested.id)
      expect(fixed!.parameters).toEqual({
        source: 'sim-a',
        keyword: 'PHP',
        limit: 50,
      })
      await finishRun(requested.id, { status: 'complete', error: null })
      // A different result limit is a different scope (F2-08).
      const larger = await requestSync({ source: 'sim-a' }, { connectors })
      expect(larger.existing).toBe(false)
      const largerRun = await readRun(larger.id)
      expect(largerRun!.parameters).toMatchObject({ limit: 100 })
      expect(largerRun!.scopeId).not.toBe(fixed!.scopeId)

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
      await finishRun(cli.id, { status: 'complete', error: null })
      const application = await requestSync(
        {
          source: 'bulldogjob',
          scopeRequest: { seniority: 'senior', source: 'bulldogjob' },
        },
        { connectors: polish },
      )
      expect(application.existing).toBe(false)
      expect((await readRun(application.id))!.scopeId).toBe(
        (await readRun(cli.id))!.scopeId,
      )
    })

    it('refuses an unknown or disabled source and creates nothing (B5-AC01)', async () => {
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

    it('creates one request per occurrence however many times and however parallel it is checked (A16-AC04, B5-AC06)', async () => {
      const connectors = scheduled()
      const cycles = await Promise.all(
        Array.from({ length: 5 }, () =>
          requestScheduledSyncs({ connectors, now }),
        ),
      )
      expect(cycles.flat()).toHaveLength(1)
      const [run] = await runs()
      expect(await jobs()).toEqual([
        {
          data: { runId: run.id, source: 'sim-scheduled' },
          singleton_key: 'sim-scheduled',
        },
      ])
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

    it('is not held back by a finished manual request of the same day, and a manual request meets the scheduled run (A16-AC04, B5-R02)', async () => {
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

    it.each(['queued', 'running'] as const)(
      'requests no run for a source with a %s manual run, and requests the occurrence once after it has finished (B5-AC06, 0mq.16 ASM-1)',
      async (status) => {
        const connectors = scheduled()
        const manual = await requestSync(
          { source: 'sim-scheduled' },
          { connectors, now },
        )
        if (status === 'running') await startRun(manual.id)
        // The occurrence's request meets the unfinished manual run and
        // creates nothing, however often it is checked.
        expect(await requestScheduledSyncs({ connectors, now })).toEqual([])
        expect(await requestScheduledSyncs({ connectors, now })).toEqual([])
        expect(await runs()).toHaveLength(1)
        expect(await jobs()).toHaveLength(1)
        // Once that run has finished, the occurrence gets its own run, once.
        await finishRun(manual.id, { status: 'complete', error: null })
        const [own] = await requestScheduledSyncs({ connectors, now })
        expect(own).toEqual({ id: expect.any(String), existing: false })
        expect(await requestScheduledSyncs({ connectors, now })).toEqual([])
        expect((await runs()).map((r) => [r.trigger, r.status])).toEqual([
          ['manual', 'complete'],
          ['scheduled', 'queued'],
        ])
        expect(await jobs()).toHaveLength(2)
      },
    )
  })

  it('requests Himalayas to the queue and carries its job out (A16-AC07, B5-AC01)', async () => {
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
    expect(job).toEqual({
      data: { runId: request.id, source: 'himalayas' },
      singleton_key: 'himalayas',
    })
    await deliver(job.data.runId, connectors)
    expect(await waitForSyncRun(request.id, { intervalMs: 100 })).toMatchObject(
      { status: 'complete' },
    )
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
    // A run no longer records its queue job or attempt.
    expect(columns).not.toContain('job_id')
    expect(columns).not.toContain('attempt')
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
