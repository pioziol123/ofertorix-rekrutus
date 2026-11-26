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
  prepareSyncRunQueue,
  sourcesMigrations,
} from '../../tests/sync-run.fixtures.ts'
import { jobspyCatalog, jobspySources } from './domain/jobspy-catalog.ts'
import { polishSources } from './domain/polish-catalog.ts'
import {
  InvalidPanelSyncRequestError,
  readSyncHistory,
  requestPanelSyncs,
  requestSync,
  syncJob,
} from './index.ts'
import type { SourceConnector } from './infrastructure/adapters/connector.ts'
import { toConnectorAd } from './infrastructure/adapters/connector.ts'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'
import { startRun } from './sync-run-state.ts'

/**
 * A test double of the queue: it refuses the job of the source named in
 * `queue.refuses` and passes every other job to the queue library.
 */
const queue = vi.hoisted(() => ({ refuses: null as string | null }))
vi.mock('../../lib/queues/index.ts', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../lib/queues/index.ts')>()
  const sendJob: typeof original.sendJob = async (definition, data) => {
    if ((data as { source?: unknown }).source === queue.refuses)
      throw new Error('The queue refused the job')
    return original.sendJob(definition, data)
  }
  return { ...original, sendJob }
})

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** A simulated source; `enabled` reads its configuration at each call. */
function simulated(
  name: string,
  enabled: () => boolean = () => true,
): SourceConnector {
  return {
    name,
    infersUnavailabilityFromAbsence: false,
    scheduled: false,
    enabled,
    scopeParameters: () => ({ source: name }),
    fetch: async (_, onBatch) => {
      await onBatch([toConnectorAd({ jobOfferKey: `${name}-one` })])
      return { complete: true }
    },
  }
}

integration('requesting syncs from the panel (T3)', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `panel_sync_${suffix}`
  const queueSchema = `panel_sync_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 6,
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
    queue.refuses = null
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
      await pool.query<{
        id: string
        source: string
        trigger: string
        status: string
        parameters: Record<string, unknown>
      }>(
        `SELECT r.id, s.source, r.trigger, r.status, s.parameters
        FROM source_sync_runs r JOIN source_scopes s ON s.id=r.scope_id
        ORDER BY r.created_at, r.id`,
      )
    ).rows
  const jobSources = async () =>
    (
      await admin.query<{ source: string }>(
        `SELECT data->>'source' AS source FROM ${queueSchema}.job
        WHERE name=$1 ORDER BY data->>'source'`,
        [syncJob.queue],
      )
    ).rows.map((row) => row.source)

  it('requests every source of the catalogue in PHP · senior, started manually, a Polish portal with its limits (T3-AC03)', async () => {
    vi.stubEnv('JOBSPY_ENABLED', 'true')
    vi.stubEnv('JOBSPY_SOURCES', jobspySources.join(','))
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'true')
    vi.stubEnv('POLISH_SOURCES', polishSources.join(','))
    const catalogue = sourceConnectors.names()
    const never = jobspySources.filter(
      (source) => jobspyCatalog[source].restriction === 'unavailable',
    )
    const result = await requestPanelSyncs(catalogue)
    expect(result.counts).toEqual({
      requested: catalogue.length - never.length,
      alreadyRunning: 0,
      skipped: never.length,
      notRequested: 0,
    })
    const stored = await runs()
    expect(stored.map((run) => run.source).sort()).toEqual(
      catalogue.filter((source) => !never.includes(source as never)).sort(),
    )
    for (const run of stored) {
      expect(run.trigger, run.source).toBe('manual')
      const { parameters } = run
      const query = parameters.query as Record<string, unknown> | undefined
      if (run.source === 'solid-jobs')
        expect(parameters).toMatchObject({
          subCategory: 'PHP',
          experience: 'Senior',
        })
      else if (run.source === 'himalayas')
        expect(parameters).toMatchObject({ q: 'PHP', seniority: 'Senior' })
      else if ((polishSources as readonly string[]).includes(run.source))
        expect(query, run.source).toMatchObject({
          source: run.source,
          technology: 'PHP',
          seniority: 'senior',
          maxOffers: 50,
          maxPages: 5,
          maxRequests: 60,
        })
      else
        expect(query, run.source).toMatchObject({ search_term: 'Senior PHP' })
    }
  })

  it.each(['queued', 'running'] as const)(
    'creates no second sync for a source whose %s sync started after the dialog read the sources, and counts it as already running (T3-AC04)',
    async (status) => {
      const connectors = createConnectorRegistry([
        simulated('sim-a'),
        simulated('sim-b'),
      ])
      // The page reads the sources for the dialog: nothing is unfinished.
      const read = await readSyncHistory({}, new Date(), connectors)
      expect(read.sources.map((s) => s.unfinishedRun)).toEqual([null, null])
      // Meanwhile the schedule or the command line starts sim-a.
      const other = await requestSync(
        { source: 'sim-a', trigger: 'scheduled' },
        { connectors },
      )
      if (status === 'running') await startRun(other.id)
      const result = await requestPanelSyncs(['sim-a', 'sim-b'], {
        connectors,
      })
      expect(result.outcomes).toEqual([
        { source: 'sim-a', outcome: 'already-running', runId: other.id },
        { source: 'sim-b', outcome: 'requested', runId: expect.any(String) },
      ])
      expect(result.counts).toMatchObject({ requested: 1, alreadyRunning: 1 })
      expect((await runs()).map((run) => run.source)).toEqual([
        'sim-a',
        'sim-b',
      ])
      // The history read now gives the dialog each unfinished sync.
      const after = await readSyncHistory({}, new Date(), connectors)
      expect(after.sources.map((s) => s.unfinishedRun)).toEqual([
        other.id,
        (result.outcomes[1] as { runId: string }).runId,
      ])
      // A repeated request gives already running for both.
      expect(
        (await requestPanelSyncs(['sim-a', 'sim-b'], { connectors })).counts,
      ).toEqual({
        requested: 0,
        alreadyRunning: 2,
        skipped: 0,
        notRequested: 0,
      })
      expect(await runs()).toHaveLength(2)
      expect(await jobSources()).toEqual(['sim-a', 'sim-b'])
    },
  )

  it('skips a source disabled before confirming and one the catalogue does not know, without an error (T3-AC05)', async () => {
    let enabled = true
    const connectors = createConnectorRegistry([
      simulated('sim-a', () => enabled),
      simulated('sim-b'),
      simulated('sim-c'),
    ])
    const read = await readSyncHistory({}, new Date(), connectors)
    expect(read.sources[0]).toMatchObject({ id: 'sim-a', enabled: true })
    enabled = false
    const result = await requestPanelSyncs(['sim-a', 'sim-unknown', 'sim-b'], {
      connectors,
    })
    expect(result.outcomes).toEqual([
      { source: 'sim-a', outcome: 'skipped' },
      { source: 'sim-unknown', outcome: 'skipped' },
      { source: 'sim-b', outcome: 'requested', runId: expect.any(String) },
    ])
    expect(result.counts).toEqual({
      requested: 1,
      alreadyRunning: 0,
      skipped: 2,
      notRequested: 0,
    })
    expect((await runs()).map((run) => run.source)).toEqual(['sim-b'])
  })

  it('leaves a source the queue refuses not requested, with nothing stored for it, and requests the other two (T3-AC06)', async () => {
    const connectors = createConnectorRegistry([
      simulated('sim-a'),
      simulated('sim-b'),
      simulated('sim-c'),
    ])
    queue.refuses = 'sim-b'
    const result = await requestPanelSyncs(['sim-a', 'sim-b', 'sim-c'], {
      connectors,
    })
    expect(result.outcomes.map((o) => [o.source, o.outcome])).toEqual([
      ['sim-a', 'requested'],
      ['sim-b', 'not-requested'],
      ['sim-c', 'requested'],
    ])
    expect(result.counts).toEqual({
      requested: 2,
      alreadyRunning: 0,
      skipped: 0,
      notRequested: 1,
    })
    expect((await runs()).map((run) => [run.source, run.status])).toEqual([
      ['sim-a', 'queued'],
      ['sim-c', 'queued'],
    ])
    expect(await jobSources()).toEqual(['sim-a', 'sim-c'])
  })

  it('takes each source once, and refuses an empty list or one longer than the catalogue, creating nothing', async () => {
    const connectors = createConnectorRegistry([
      simulated('sim-a'),
      simulated('sim-b'),
    ])
    await expect(requestPanelSyncs([], { connectors })).rejects.toBeInstanceOf(
      InvalidPanelSyncRequestError,
    )
    await expect(
      requestPanelSyncs(['sim-a', 'sim-b', 'sim-c'], { connectors }),
    ).rejects.toBeInstanceOf(InvalidPanelSyncRequestError)
    expect(await runs()).toEqual([])
    const result = await requestPanelSyncs(
      ['sim-a', 'sim-a', 'sim-a', 'sim-b'],
      { connectors },
    )
    expect(result.outcomes.map((o) => o.source)).toEqual(['sim-a', 'sim-b'])
    expect(await runs()).toHaveLength(2)
  })
})
