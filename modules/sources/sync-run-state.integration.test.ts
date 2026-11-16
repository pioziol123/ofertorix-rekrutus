import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
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
import { closePool, queueDatabase, setPool } from '../../lib/db.ts'
import { requireQueued } from '../../lib/queue.ts'
import {
  admitRun,
  finishRun,
  listUnfinishedRuns,
  readRun,
  startRun,
  type RunAdmission,
} from './sync-run-state.ts'
import * as repository from './infrastructure/persistence/sync-runs.ts'

// The repository stays real; single tests interleave other work between its
// calls to reproduce races deterministically.
vi.mock('./infrastructure/persistence/sync-runs.ts', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('./infrastructure/persistence/sync-runs.ts')
    >()
  return {
    ...actual,
    insertQueuedRun: vi.fn(actual.insertQueuedRun),
    findQueuedRunId: vi.fn(actual.findQueuedRunId),
  }
})

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('sync run state in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `run_state_${suffix}`
  const queueSchema = `run_queue_${suffix}`
  const queue = 'sync-run-state-test'
  let admin: Pool
  let pool: Pool
  let boss: PgBoss

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 12,
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
    await boss.createQueue(queue)
  }, 30_000)

  beforeEach(async () => {
    vi.clearAllMocks()
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
    await admin.query(`DELETE FROM ${queueSchema}.job WHERE name=$1`, [queue])
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

  const admission = (overrides: Partial<RunAdmission> = {}): RunAdmission => ({
    source: 'test-source',
    parameters: { source: 'test-source', keyword: 'php', limit: 100 },
    trigger: 'manual',
    scheduleDay: '2026-11-16',
    sendJob: (runId) =>
      requireQueued(boss.send(queue, { runId }, { db: queueDatabase })),
    ...overrides,
  })
  const runs = async () =>
    (
      await pool.query<{ id: string; status: string; job_id: string | null }>(
        'SELECT id,status,job_id FROM source_sync_runs ORDER BY created_at,id',
      )
    ).rows
  const jobs = async () =>
    (
      await admin.query<{ id: string; data: { runId: string } }>(
        `SELECT id,data FROM ${queueSchema}.job WHERE name=$1`,
        [queue],
      )
    ).rows
  const rawRow = async (id: string) =>
    (await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [id]))
      .rows[0]

  it('admits ten concurrent requests as one queued run with one queue job (A3-AC01)', async () => {
    const admitted = await Promise.all(
      Array.from({ length: 10 }, () => admitRun(admission())),
    )
    const ids = new Set(admitted.map((result) => result.id))
    expect(ids.size).toBe(1)
    expect(admitted.filter((result) => !result.existing)).toHaveLength(1)
    const [run] = await runs()
    expect(await runs()).toEqual([
      { id: [...ids][0], status: 'queued', job_id: expect.any(String) },
    ])
    expect(await jobs()).toEqual([
      { id: run!.job_id, data: { runId: run!.id } },
    ])
  })

  it('admits a new queued run when the conflicting one starts before it is read (A3-AC01, F2-07, ASM-2)', async () => {
    const first = await admitRun(admission())
    // The admission's insert conflicts with the queued run, which then starts
    // (another worker) before the admission reads it back.
    vi.mocked(repository.findQueuedRunId).mockImplementationOnce(
      async (scopeId) => {
        await pool.query(
          `UPDATE source_sync_runs SET status='running', started_at=now()
        WHERE scope_id=$1 AND status='queued'`,
          [scopeId],
        )
        return null
      },
    )
    vi.clearAllMocks()
    const second = await admitRun(admission())
    expect(repository.insertQueuedRun).toHaveBeenCalledTimes(2)
    expect(repository.findQueuedRunId).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ id: expect.any(String), existing: false })
    expect(second.id).not.toBe(first.id)
    const rows = await runs()
    expect(rows.map((run) => [run.id, run.status])).toEqual([
      [first.id, 'running'],
      [second.id, 'queued'],
    ])
    expect((await jobs()).map((job) => job.data.runId).sort()).toEqual(
      [first.id, second.id].sort(),
    )
    expect(await admitRun(admission())).toEqual({
      id: second.id,
      existing: true,
    })
  })

  it('fails the admission without changes when it does not settle after three attempts (ASM-2)', async () => {
    vi.mocked(repository.insertQueuedRun).mockResolvedValue(null)
    vi.mocked(repository.findQueuedRunId).mockResolvedValue(null)
    try {
      await expect(admitRun(admission())).rejects.toThrow(
        'Sync run admission did not settle; retry the request',
      )
      expect(repository.insertQueuedRun).toHaveBeenCalledTimes(3)
      expect(repository.findQueuedRunId).toHaveBeenCalledTimes(3)
    } finally {
      // Restores the real repository functions given to vi.fn.
      vi.mocked(repository.insertQueuedRun).mockReset()
      vi.mocked(repository.findQueuedRunId).mockReset()
    }
    expect(await runs()).toEqual([])
    expect(await jobs()).toEqual([])
    expect((await pool.query('SELECT * FROM source_scopes')).rowCount).toBe(0)
  })

  it('creates neither the run nor the job when sending the job fails (A3-R02)', async () => {
    await expect(
      admitRun(
        admission({
          sendJob: async (runId) => {
            await boss.send(queue, { runId }, { db: queueDatabase })
            throw new Error('queue rejected the job')
          },
        }),
      ),
    ).rejects.toThrow('queue rejected the job')
    expect(await runs()).toEqual([])
    expect(await jobs()).toEqual([])
    expect((await pool.query('SELECT * FROM source_scopes')).rowCount).toBe(0)
  })

  it('admits one queued run next to a running one and points later requests at it (A3-AC02)', async () => {
    const first = await admitRun(admission())
    expect(await startRun(first.id)).toMatchObject({
      id: first.id,
      status: 'running',
    })
    const queued = await admitRun(admission())
    expect(queued).toEqual({ id: expect.any(String), existing: false })
    expect(queued.id).not.toBe(first.id)
    expect(await admitRun(admission())).toEqual({
      id: queued.id,
      existing: true,
    })
    expect(await admitRun(admission())).toEqual({
      id: queued.id,
      existing: true,
    })
    expect(await jobs()).toHaveLength(2)
  })

  it('ignores finished runs of the scope when admitting (A3-AC02)', async () => {
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

  it('does not start a run twice or start a finished run (A3-AC03)', async () => {
    const { id } = await admitRun(admission())
    const started = await startRun(id)
    expect(started).toMatchObject({
      status: 'running',
      startedAt: expect.any(Date),
    })
    const afterStart = await rawRow(id)

    expect(await startRun(id)).toBeNull()
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
    const php = await admitRun(admission())
    const java = await admitRun(
      admission({
        parameters: { source: 'test-source', keyword: 'java', limit: 100 },
      }),
    )
    const larger = await admitRun(
      admission({
        parameters: { source: 'test-source', keyword: 'php', limit: 200 },
      }),
    )
    const reordered = await admitRun(
      admission({
        parameters: { limit: 100, keyword: 'php', source: 'test-source' },
      }),
    )
    expect(java.existing).toBe(false)
    expect(larger.existing).toBe(false)
    expect(reordered).toEqual({ id: php.id, existing: true })
    expect(new Set([php.id, java.id, larger.id]).size).toBe(3)

    const runPhp = await readRun(php.id)
    const runJava = await readRun(java.id)
    const runLarger = await readRun(larger.id)
    expect(
      new Set([runPhp, runJava, runLarger].map((r) => r!.scopeId)).size,
    ).toBe(3)
    expect(runPhp).toMatchObject({
      source: 'test-source',
      parameters: { source: 'test-source', keyword: 'php', limit: 100 },
      trigger: 'manual',
      scheduleDay: '2026-11-16',
      status: 'queued',
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

  it('allows one running and one queued run per scope, never two of either (A3-AC05)', async () => {
    const running = await admitRun(admission())
    await startRun(running.id)
    const queued = await admitRun(admission())
    expect((await runs()).map((run) => [run.id, run.status])).toEqual([
      [running.id, 'running'],
      [queued.id, 'queued'],
    ])
    const { scope_id: scopeId } = await rawRow(running.id)
    for (const status of ['queued', 'running']) {
      await expect(
        pool.query(
          `INSERT INTO source_sync_runs(id,scope_id,trigger,status,schedule_day)
          VALUES ($1,$2,'manual',$3,'2026-11-16')`,
          [randomUUID(), scopeId, status],
        ),
      ).rejects.toMatchObject({ code: '23505' })
    }
  })

  it('refuses to start a queued run while another run of its scope is running (A3-AC05, ASM-1)', async () => {
    const running = await admitRun(admission())
    await startRun(running.id)
    const queued = await admitRun(admission())
    const before = await rawRow(queued.id)
    await expect(startRun(queued.id)).rejects.toMatchObject({ code: '23505' })
    expect(await rawRow(queued.id)).toEqual(before)
    expect(
      await finishRun(running.id, { status: 'complete', error: null }),
    ).toBe(true)
    expect(await startRun(queued.id)).toMatchObject({ status: 'running' })
  })

  it('reads a run with its scope and lists unfinished runs oldest first', async () => {
    const first = await admitRun(admission())
    const other = await admitRun(
      admission({
        source: 'other-source',
        parameters: { source: 'other-source' },
        trigger: 'scheduled',
      }),
    )
    const finished = await admitRun(
      admission({ parameters: { source: 'test-source', keyword: 'go' } }),
    )
    await finishRun(finished.id, { status: 'failed', error: 'stopped' })
    await startRun(first.id)
    const second = await admitRun(admission())

    const firstRun = await readRun(first.id)
    expect(firstRun).toMatchObject({
      id: first.id,
      source: 'test-source',
      status: 'running',
      jobId: expect.any(String),
      pages: 0,
      uniqueAds: 0,
      revisions: 0,
      error: null,
      createdAt: expect.any(Date),
      startedAt: expect.any(Date),
      finishedAt: null,
    })
    expect(await readRun(randomUUID())).toBeNull()
    expect((await listUnfinishedRuns()).map((run) => run.id)).toEqual([
      first.id,
      other.id,
      second.id,
    ])
    expect(
      (await listUnfinishedRuns('test-source')).map((run) => run.id),
    ).toEqual([first.id, second.id])
    expect(await listUnfinishedRuns('other-source')).toMatchObject([
      { id: other.id, trigger: 'scheduled', status: 'queued' },
    ])
  })
})
