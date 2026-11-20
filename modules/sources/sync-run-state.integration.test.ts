import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../lib/db.ts'
import { sendJob, stopQueues } from '../../lib/queues/index.ts'
import {
  prepareSyncRunQueue,
  sourcesMigrations,
} from '../../tests/sync-run.fixtures.ts'
import { syncJob } from './index.ts'
import {
  admitRun,
  finishRun,
  listUnfinishedRuns,
  readRun,
  startRun,
  type RunAdmission,
} from './sync-run-state.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('sync run state in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `run_state_${suffix}`
  const queueSchema = `run_queue_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 12,
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
    await admin.query(`DELETE FROM ${queueSchema}.job WHERE name=$1`, [
      syncJob.queue,
    ])
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

  const admission = (overrides: Partial<RunAdmission> = {}): RunAdmission => {
    const source = overrides.source ?? 'test-source'
    return {
      source,
      parameters: { source, keyword: 'php', limit: 100 },
      trigger: 'manual',
      scheduleDay: '2026-11-16',
      sendJob: (runId) => sendJob(syncJob, { runId, source }),
      ...overrides,
    }
  }
  const runs = async () =>
    (
      await pool.query<{ id: string; status: string }>(
        'SELECT id,status FROM source_sync_runs ORDER BY created_at,id',
      )
    ).rows
  const jobs = async () =>
    (
      await admin.query<{
        data: { runId: string; source: string }
        singleton_key: string
      }>(
        `SELECT data,singleton_key FROM ${queueSchema}.job WHERE name=$1 ORDER BY created_on`,
        [syncJob.queue],
      )
    ).rows
  const rawRow = async (id: string) =>
    (await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [id]))
      .rows[0]

  it('admits ten concurrent requests of one source as one queued run with one queue job (A3-AC01, B5-AC02)', async () => {
    const admitted = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        admitRun(
          admission({
            // Half of them for another scope of the same source.
            parameters: {
              source: 'test-source',
              keyword: i % 2 ? 'php' : 'java',
            },
          }),
        ),
      ),
    )
    const ids = new Set(admitted.map((result) => result.id))
    expect(ids.size).toBe(1)
    expect(admitted.filter((result) => !result.existing)).toHaveLength(1)
    const [id] = [...ids]
    expect(await runs()).toEqual([{ id, status: 'queued' }])
    expect(await jobs()).toEqual([
      {
        data: { runId: id, source: 'test-source' },
        singleton_key: 'test-source',
      },
    ])
  })

  it.each(['queued', 'running'] as const)(
    'returns the source’s %s run for the same and another scope and creates no run or job (A3-AC02, B5-AC02)',
    async (status) => {
      const first = await admitRun(admission())
      if (status === 'running') await startRun(first.id)
      const before = {
        runs: await runs(),
        jobs: await jobs(),
        scopes: (await pool.query('SELECT * FROM source_scopes')).rows,
      }
      for (const parameters of [
        { source: 'test-source', keyword: 'php', limit: 100 },
        { source: 'test-source', keyword: 'java', limit: 100 },
      ])
        expect(await admitRun(admission({ parameters }))).toEqual({
          id: first.id,
          existing: true,
        })
      expect(await runs()).toEqual(before.runs)
      expect(await runs()).toEqual([{ id: first.id, status }])
      expect(await jobs()).toEqual(before.jobs)
      expect((await pool.query('SELECT * FROM source_scopes')).rows).toEqual(
        before.scopes,
      )
    },
  )

  it('admits runs of two sources independently (B5-AC02)', async () => {
    const first = await admitRun(admission())
    const other = await admitRun(admission({ source: 'other-source' }))
    expect(other).toEqual({ id: expect.any(String), existing: false })
    expect(other.id).not.toBe(first.id)
    expect((await jobs()).map((job) => job.singleton_key)).toEqual([
      'test-source',
      'other-source',
    ])
  })

  it('creates neither the run nor the job when sending the job fails (A3-R02)', async () => {
    await expect(
      admitRun(
        admission({
          sendJob: async (runId) => {
            await sendJob(syncJob, { runId, source: 'test-source' })
            throw new Error('queue rejected the job')
          },
        }),
      ),
    ).rejects.toThrow('queue rejected the job')
    expect(await runs()).toEqual([])
    expect(await jobs()).toEqual([])
    expect((await pool.query('SELECT * FROM source_scopes')).rowCount).toBe(0)
  })

  it('ignores finished runs of the source when admitting (A3-AC02)', async () => {
    for (const status of ['complete', 'partial', 'failed'] as const) {
      const run = await admitRun(admission())
      await startRun(run.id)
      expect(await finishRun(run.id, { status, error: null })).toBe(true)
    }
    const queued = await admitRun(admission())
    expect(queued.existing).toBe(false)
    expect((await runs()).map((run) => run.status)).toEqual([
      'complete',
      'partial',
      'failed',
      'queued',
    ])
  })

  it('takes a running run over without restarting it, and never starts a finished run (A3-AC03, B5-AC04)', async () => {
    const { id } = await admitRun(admission())
    const started = await startRun(id)
    expect(started).toMatchObject({
      status: 'running',
      startedAt: expect.any(Date),
    })
    const afterStart = await rawRow(id)

    // A later attempt finds the run running and continues it.
    expect(await startRun(id)).toEqual(started)
    expect(await rawRow(id)).toEqual(afterStart)

    expect(
      await finishRun(id, {
        status: 'partial',
        error: 'source stopped',
        diagnostics: { pages: [1, 2] },
      }),
    ).toBe(true)
    const afterFinish = await rawRow(id)
    expect(afterFinish).toMatchObject({
      status: 'partial',
      error: 'source stopped',
      diagnostics: { pages: [1, 2] },
      finished_at: expect.any(Date),
    })

    expect(await startRun(id)).toBeNull()
    expect(await finishRun(id, { status: 'complete', error: null })).toBe(false)
    expect(await rawRow(id)).toEqual(afterFinish)
    expect(await startRun(randomUUID())).toBeNull()
  })

  it('finishes a run only from the given states', async () => {
    const { id } = await admitRun(admission())
    expect(
      await finishRun(id, { status: 'failed', error: null }, ['running']),
    ).toBe(false)
    expect((await readRun(id))!.status).toBe('queued')
    await startRun(id)
    expect(
      await finishRun(id, { status: 'failed', error: null }, ['running']),
    ).toBe(true)
    expect((await readRun(id))!.status).toBe('failed')
  })

  it('finishes a queued run that never started (A3-R05)', async () => {
    const { id } = await admitRun(admission())
    expect(
      await finishRun(id, { status: 'failed', error: 'Unknown source' }),
    ).toBe(true)
    expect(await readRun(id)).toMatchObject({
      status: 'failed',
      error: 'Unknown source',
      diagnostics: null,
      startedAt: null,
      finishedAt: expect.any(Date),
    })
    expect(await startRun(id)).toBeNull()
  })

  it('admits other settings as a separate scope and keeps the admitted settings (A3-AC04)', async () => {
    /** Admits the parameters and finishes the run, so the next one is admitted. */
    const admitFinished = async (parameters: Record<string, unknown>) => {
      const admitted = await admitRun(admission({ parameters }))
      await finishRun(admitted.id, { status: 'complete', error: null })
      return admitted
    }
    const php = await admitFinished({
      source: 'test-source',
      keyword: 'php',
      limit: 100,
    })
    const java = await admitFinished({
      source: 'test-source',
      keyword: 'java',
      limit: 100,
    })
    const larger = await admitFinished({
      source: 'test-source',
      keyword: 'php',
      limit: 200,
    })
    const reordered = await admitFinished({
      limit: 100,
      keyword: 'php',
      source: 'test-source',
    })
    for (const admitted of [php, java, larger, reordered])
      expect(admitted.existing).toBe(false)

    const runPhp = await readRun(php.id)
    const runJava = await readRun(java.id)
    const runLarger = await readRun(larger.id)
    const runReordered = await readRun(reordered.id)
    expect(
      new Set([runPhp, runJava, runLarger].map((r) => r!.scopeId)).size,
    ).toBe(3)
    expect(runReordered!.scopeId).toBe(runPhp!.scopeId)
    expect(runPhp).toMatchObject({
      source: 'test-source',
      parameters: { source: 'test-source', keyword: 'php', limit: 100 },
      trigger: 'manual',
      scheduleDay: '2026-11-16',
    })
    expect(runJava!.parameters).toEqual({
      source: 'test-source',
      keyword: 'java',
      limit: 100,
    })
    expect(runLarger!.parameters).toEqual({
      source: 'test-source',
      keyword: 'php',
      limit: 200,
    })
  })

  it('never allows two queued or two running runs of one scope (A3-AC05)', async () => {
    const running = await admitRun(admission())
    await startRun(running.id)
    const { scope_id: scopeId } = await rawRow(running.id)
    const insert = (status: string) =>
      pool.query(
        `INSERT INTO source_sync_runs(id,scope_id,trigger,status,schedule_day)
        VALUES ($1,$2,'manual',$3,'2026-11-16')`,
        [randomUUID(), scopeId, status],
      )
    await insert('queued')
    for (const status of ['queued', 'running'])
      await expect(insert(status)).rejects.toMatchObject({ code: '23505' })
  })

  it('reads a run with its scope and lists unfinished runs oldest first', async () => {
    const finished = await admitRun(
      admission({ parameters: { source: 'test-source', keyword: 'go' } }),
    )
    await finishRun(finished.id, { status: 'failed', error: 'stopped' })
    const first = await admitRun(admission())
    const other = await admitRun(
      admission({
        source: 'other-source',
        parameters: { source: 'other-source' },
        trigger: 'scheduled',
      }),
    )
    await startRun(first.id)

    const firstRun = await readRun(first.id)
    expect(firstRun).toEqual({
      id: first.id,
      scopeId: expect.any(String),
      source: 'test-source',
      parameters: { source: 'test-source', keyword: 'php', limit: 100 },
      trigger: 'manual',
      scheduleDay: '2026-11-16',
      status: 'running',
      pages: 0,
      uniqueAds: 0,
      revisions: 0,
      error: null,
      diagnostics: null,
      createdAt: expect.any(Date),
      startedAt: expect.any(Date),
      finishedAt: null,
    })
    expect(await readRun(randomUUID())).toBeNull()
    expect((await listUnfinishedRuns()).map((run) => run.id)).toEqual([
      first.id,
      other.id,
    ])
    expect(
      (await listUnfinishedRuns('test-source')).map((run) => run.id),
    ).toEqual([first.id])
    expect(await listUnfinishedRuns('other-source')).toMatchObject([
      { id: other.id, trigger: 'scheduled', status: 'queued' },
    ])
  })
})
