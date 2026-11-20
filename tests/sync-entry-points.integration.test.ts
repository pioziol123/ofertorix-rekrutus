import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
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
import { closePool, setPool } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { polishSources } from '../modules/sources/infrastructure/adapters/polish/runner.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { Page } from '../modules/sources/infrastructure/adapters/solid-jobs/api.ts'
import { requestSync, syncJob } from '../modules/sources/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { createConnectorRegistry } from '../modules/sources/infrastructure/adapters/connector-registry.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { createHimalayasConnector } from '../modules/sources/infrastructure/adapters/himalayas/connector.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { sourceConnectors } from '../modules/sources/infrastructure/adapters/source-connectors.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { createSolidJobsConnector } from '../modules/sources/infrastructure/adapters/solid-jobs/connector.ts'
import { query } from './fixtures/polish/result.ts'
import {
  deliver,
  prepareSyncRunQueue,
  sourcesMigrations,
} from './sync-run.fixtures.ts'
import { waitFor } from './worker.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
const run = promisify(execFile)

// B5-AC01, A16-AC05, A16-AC07: the CLI scripts request through the shared
// operation to the queue of sync runs; the sync handler, here called in the
// test process with simulated sources as the worker would, carries the run
// out; the script waits for it and exits by status.
integration('sync entry points on the shared sync run queue', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `sync_entry_${suffix}`
  const queueSchema = `sync_entry_q_${suffix}`
  const connection = new URL(process.env.DATABASE_URL!)
  connection.searchParams.set('options', `-c search_path=${schema}`)
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool
  let pool: Pool
  /** What the simulated SOLID.Jobs answers next; a gate may hold it. */
  let solidPage: () => Promise<Page>

  const page = (keys: string[], valid = true): Page => ({
    jobs: keys.map((jobOfferKey) => ({ jobOfferKey })),
    valid,
    totalCount: keys.length,
    totalPages: 1,
  })
  const connectors = createConnectorRegistry([
    createSolidJobsConnector(() => solidPage()),
    createHimalayasConnector(async () => ({
      jobs: [],
      valid: true,
      totalCount: 0,
      rejected: 0,
      missingDescriptions: 0,
    })),
  ])

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({ connectionString: connection.toString(), max: 8 })
    setPool(pool)
    for (const migration of sourcesMigrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    await prepareSyncRunQueue(queueSchema)
    // Requests from the test process send their jobs on the queue library's
    // client of this schema.
    process.env.PG_BOSS_SCHEMA = queueSchema
  }, 30_000)

  beforeEach(async () => {
    vi.stubEnv('JOBSPY_ENABLED', 'true')
    vi.stubEnv('JOBSPY_SOURCES', '')
    vi.stubEnv('POLISH_SOURCES', polishSources.join(','))
    solidPage = async () => page(['solid-one'])
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
  })
  afterEach(() => vi.unstubAllEnvs())

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

  /** Runs a CLI script against the isolated schemas; returns its exit code. */
  async function cli(script: string, ...args: string[]) {
    const env = {
      ...process.env,
      DATABASE_URL: connection.toString(),
      PG_BOSS_SCHEMA: queueSchema,
    }
    try {
      const { stdout } = await run(
        'node_modules/.bin/tsx',
        [`scripts/${script}.ts`, ...args],
        { env, timeout: 60_000 },
      )
      return { code: 0, stdout }
    } catch (error) {
      const failed = error as { code?: number; stdout?: string }
      return { code: failed.code ?? -1, stdout: failed.stdout ?? '' }
    }
  }
  const runs = async () =>
    (
      await pool.query(
        `SELECT r.id, r.status, s.source FROM source_sync_runs r
        JOIN source_scopes s ON s.id=r.scope_id ORDER BY r.created_at`,
      )
    ).rows
  /** Carries out, as the worker would, the run a script is about to request. */
  async function deliverRequested(): Promise<string> {
    const id = await waitFor(
      async () =>
        (
          await pool.query<{ id: string }>(
            "SELECT id FROM source_sync_runs WHERE status='queued'",
          )
        ).rows[0]?.id,
      30_000,
      'the requested run',
    )
    await deliver(id, connectors)
    return id
  }

  it('requests every registered source, Himalayas included, as a job of the one sync run queue keyed by its source (B5-R01, A16-R01, A16-R05)', async () => {
    vi.stubEnv('JOBSPY_SOURCES', 'linkedin,bayt')
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'true')
    const names = sourceConnectors
      .names()
      .filter((name) => sourceConnectors.get(name).enabled())
    expect(names).toEqual(
      expect.arrayContaining(['solid-jobs', 'himalayas', 'indeed', 'linkedin']),
    )
    const ids: string[] = []
    for (const name of names)
      ids.push(
        (
          await requestSync({
            source: name,
            scopeRequest: polishSources.includes(name as never)
              ? query(name as never)
              : undefined,
          })
        ).id,
      )
    const jobs = await admin.query(
      `SELECT data->>'runId' AS run, data->>'source' AS source, singleton_key
      FROM ${queueSchema}.job
      WHERE name=$1 AND data->>'runId' = ANY($2::text[])`,
      [syncJob.queue, ids],
    )
    expect(jobs.rows).toHaveLength(names.length)
    for (const job of jobs.rows) expect(job.singleton_key).toBe(job.source)
    expect(new Set(jobs.rows.map((job) => job.source))).toEqual(new Set(names))
    expect((await runs()).map((r) => r.status)).toEqual(
      names.map(() => 'queued'),
    )
  }, 60_000)

  it('SOLID.Jobs CLI waits for its run and exits 0 when it is complete, 1 otherwise (B5-AC01, A16-AC05)', async () => {
    const [complete] = await Promise.all([
      cli('source-sync', '--wait'),
      deliverRequested(),
    ])
    expect(complete.code).toBe(0)
    expect(complete.stdout).toContain('"reused": false')
    expect(complete.stdout).toContain('"status": "complete"')
    expect(complete.stdout).toContain('"lastComplete"')

    solidPage = async () => page([], false)
    const [failed] = await Promise.all([
      cli('source-sync', '--wait'),
      deliverRequested(),
    ])
    expect(failed.code).toBe(1)
    expect(failed.stdout).toContain('"status": "failed"')
    expect((await runs()).map((r) => r.status)).toEqual(['complete', 'failed'])
  }, 90_000)

  it('SOLID.Jobs CLI pointed at a running run waits for that run (B5-R02, A16-R04)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    solidPage = async () => {
      entered()
      await gate
      return page(['solid-one'])
    }
    const first = await requestSync({ source: 'solid-jobs' })
    const execution = deliver(first.id, connectors)
    await started
    let finished = false
    const waiting = cli('source-sync', '--wait').finally(() => {
      finished = true
    })
    try {
      // The script cannot finish while the run it points at is running.
      await delay(3000)
      expect(finished).toBe(false)
      expect((await runs()).map((r) => r.status)).toEqual(['running'])
    } finally {
      release()
      await execution
    }
    const result = await waiting
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(`"id": "${first.id}"`)
    expect(result.stdout).toContain('"reused": true')
    expect((await runs()).map((r) => [r.id, r.status])).toEqual([
      [first.id, 'complete'],
    ])
  }, 90_000)

  it('Himalayas CLI requests to the queue, the sync handler carries the run out and the CLI prints its result without --wait (A16-AC07, 0mq.16 ASM-2)', async () => {
    const [result] = await Promise.all([
      cli('himalayas-sync'),
      deliverRequested(),
    ])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'complete',
      seen: 0,
      pages: 1,
      error: null,
    })
    expect(await runs()).toEqual([
      expect.objectContaining({ source: 'himalayas', status: 'complete' }),
    ])
  }, 60_000)
})
