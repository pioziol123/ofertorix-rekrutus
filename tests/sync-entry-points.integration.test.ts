import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
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
import { polishSources } from '../lib/sources/polish.ts'
import type { Page } from '../lib/sources/solid.ts'
import {
  requestSync,
  syncQueue,
  syncQueueOptions,
  useSyncQueue,
  waitForSyncRun,
  workSyncQueue,
} from '../modules/sources/index.ts'
import { createConnectorRegistry } from '../modules/sources/infrastructure/adapters/connector-registry.ts'
import { createHimalayasConnector } from '../modules/sources/infrastructure/adapters/himalayas/connector.ts'
import { sourceConnectors } from '../modules/sources/infrastructure/adapters/source-connectors.ts'
import { createSolidJobsConnector } from '../modules/sources/infrastructure/adapters/solid-jobs/connector.ts'
import { query } from './fixtures/polish/result.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
const run = promisify(execFile)

// A16-AC05, A16-AC07: the CLI scripts request through the shared operation
// to the sync queue; a worker, here in the test process with simulated
// sources, executes the run; the script waits for it and exits by status.
integration('sync entry points on the shared sync queue', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `sync_entry_${suffix}`
  const queueSchema = `sync_entry_q_${suffix}`
  const connection = new URL(process.env.DATABASE_URL!)
  connection.searchParams.set('options', `-c search_path=${schema}`)
  let admin: Pool
  let pool: Pool
  let boss: PgBoss
  let worker: PgBoss
  /** What the simulated SOLID.Jobs answers next; a gate may hold it. */
  let solidPage: () => Promise<Page>

  const page = (keys: string[], valid = true): Page => ({
    jobs: keys.map((jobOfferKey) => ({ jobOfferKey })),
    valid,
    totalCount: keys.length,
    totalPages: 1,
  })

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({ connectionString: connection.toString(), max: 8 })
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
    await boss.createQueue(syncQueue, syncQueueOptions)
    useSyncQueue(boss)
    worker = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
    })
    worker.on('error', () => {})
    await worker.start()
    await workSyncQueue(
      worker,
      createConnectorRegistry([
        createSolidJobsConnector(() => solidPage()),
        createHimalayasConnector(async () => ({
          jobs: [],
          valid: true,
          totalCount: 0,
          rejected: 0,
          missingDescriptions: 0,
        })),
      ]),
    )
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
    await worker?.stop()
    await boss?.stop()
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

  it('requests every registered source, Himalayas included, to the one sync queue grouped by source (A16-R01, A16-R05)', async () => {
    vi.stubEnv('JOBSPY_SOURCES', 'linkedin,bayt')
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'true')
    const names = sourceConnectors
      .names()
      .filter((name) => sourceConnectors.get(name).enabled())
    expect(names).toEqual(
      expect.arrayContaining(['solid-jobs', 'himalayas', 'indeed', 'linkedin']),
    )
    const ids: string[] = []
    for (const name of names.filter(
      (n) => n !== 'solid-jobs' && n !== 'himalayas',
    ))
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
      `SELECT data->>'runId' AS run, group_id FROM ${queueSchema}.job
      WHERE name=$1 AND data->>'runId' = ANY($2::text[])`,
      [syncQueue, ids],
    )
    expect(new Set(jobs.rows.map((j) => j.group_id))).toEqual(
      new Set(names.filter((n) => n !== 'solid-jobs' && n !== 'himalayas')),
    )
    // The test's worker knows no connector of these sources; it fails them.
    for (const id of ids) await waitForSyncRun(id, { intervalMs: 100 })
  }, 60_000)

  it('SOLID.Jobs CLI waits for its run and exits 0 when it is complete, 1 otherwise (A16-AC05)', async () => {
    const complete = await cli('source-sync', '--wait')
    expect(complete.code).toBe(0)
    expect(complete.stdout).toContain('"reused": false')
    expect(complete.stdout).toContain('"status": "complete"')
    expect(complete.stdout).toContain('"lastComplete"')

    solidPage = async () => page([], false)
    const failed = await cli('source-sync', '--wait')
    expect(failed.code).toBe(1)
    expect(failed.stdout).toContain('"status": "failed"')
    expect((await runs()).map((r) => r.status)).toEqual(['complete', 'failed'])
  }, 90_000)

  it('SOLID.Jobs CLI pointed at a pending run waits for that run (A16-R04)', async () => {
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
    await started
    const pending = await requestSync({ source: 'solid-jobs' })
    solidPage = async () => page(['solid-two'])
    const waiting = cli('source-sync', '--wait')
    // The script cannot finish while the run it points at is pending.
    await new Promise((resolve) => setTimeout(resolve, 3000))
    expect((await runs()).map((r) => r.status)).toEqual(['running', 'queued'])
    release()
    const result = await waiting
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(`"id": "${pending.id}"`)
    expect(result.stdout).toContain('"reused": true')
    expect((await runs()).map((r) => [r.id, r.status])).toEqual([
      [first.id, 'complete'],
      [pending.id, 'complete'],
    ])
  }, 90_000)

  it('Himalayas CLI requests to the queue, a worker executes the run and the CLI prints its result without --wait (A16-AC07, 0mq.16 ASM-2)', async () => {
    const result = await cli('himalayas-sync')
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
