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
import { closePool, setPool } from '../lib/db.ts'
import { enqueueJobspy } from '../lib/sources/jobspy-sync.ts'
import { polishSources } from '../lib/sources/polish.ts'
import { enqueuePolish } from '../lib/sources/polish-sync.ts'
import { enqueueSync } from '../lib/sources/sync.ts'
import {
  syncQueueFor,
  syncQueues,
  workSyncQueues,
} from '../lib/sources/sync-queues.ts'
import { syncJobOptions } from '../modules/sources/index.ts'
import { createConnectorRegistry } from '../modules/sources/infrastructure/adapters/connector-registry.ts'
import { createJobspyConnector } from '../modules/sources/infrastructure/adapters/jobspy/connector.ts'
import { createPolishConnector } from '../modules/sources/infrastructure/adapters/polish/connector.ts'
import { sourceConnectors } from '../modules/sources/infrastructure/adapters/source-connectors.ts'
import { createSolidJobsConnector } from '../modules/sources/infrastructure/adapters/solid-jobs/connector.ts'
import { result as jobspyResult } from './fixtures/jobspy/result.ts'
import { query, result as polishResult } from './fixtures/polish/result.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

// A5-AC11: every existing way of requesting a sync ends with a run the
// shared executor finished. The worker's wiring serves the queues here; the
// executor alone records the queue attempt that held the run.
integration('sync requests executed by the shared executor', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `sync_entry_${suffix}`
  const queueSchema = `sync_entry_queue_${suffix}`
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
    for (const queue of syncQueues)
      await boss.createQueue(queue, syncJobOptions)
    await workSyncQueues(
      boss,
      createConnectorRegistry([
        createSolidJobsConnector(async () => ({
          jobs: [{ jobOfferKey: 'solid-one' }],
          valid: true,
          totalCount: 1,
          totalPages: 1,
        })),
        createJobspyConnector('indeed', async () => jobspyResult()),
        createPolishConnector('bulldogjob', async (q) => polishResult(q)),
      ]),
    )
  }, 30_000)

  beforeEach(async () => {
    vi.stubEnv('JOBSPY_ENABLED', 'true')
    vi.stubEnv('POLISH_SOURCES', polishSources.join(','))
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
  })
  afterEach(() => vi.unstubAllEnvs())

  afterAll(async () => {
    await boss?.stop()
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })

  async function finished(runId: string) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await pool.query(
        'SELECT status,attempt,seen FROM source_sync_runs WHERE id=$1',
        [runId],
      )
      if (!['queued', 'running'].includes(rows[0].status)) return rows[0]
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Run did not finish')
  }

  it.each([
    // The SOLID.Jobs CLI and the schedule enqueue through the same function.
    ['SOLID.Jobs CLI', () => enqueueSync(boss, 'manual')],
    ['SOLID.Jobs schedule', () => enqueueSync(boss, 'scheduled')],
    ['JobSpy CLI', () => enqueueJobspy(boss)],
    // The Polish portal CLI and the application route.
    ['Polish portal CLI and application', () => enqueuePolish(boss, query())],
  ])('%s', async (_, request) => {
    const requested = await request()
    expect(await finished(requested!.id)).toEqual({
      status: 'complete',
      attempt: 0,
      seen: 1,
    })
  })

  it('serves every registered source by a queue, except Himalayas run by its CLI', () => {
    const queued = sourceConnectors
      .names()
      .filter((name) => syncQueueFor(name) !== null)
    expect(sourceConnectors.names().filter((n) => !queued.includes(n))).toEqual(
      ['himalayas'],
    )
    expect(new Set(queued.map(syncQueueFor))).toEqual(new Set(syncQueues))
  })
})
