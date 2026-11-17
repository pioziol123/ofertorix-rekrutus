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
  executeSyncRun,
  recoverSyncRuns,
  runSyncInProcess,
  SyncRunLostError,
  syncJobOptions,
} from './index.ts'
import {
  ConnectorError,
  toConnectorAd,
  type BatchReceiver,
  type ConnectorAd,
  type ConnectorResult,
  type ScopeParameters,
  type SourceConnector,
} from './infrastructure/adapters/connector.ts'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'
import { inProcessRunLimitSeconds } from './recover-sync-runs.ts'
import { SyncRunAlreadyActiveError } from './run-sync-in-process.ts'
import { admitRun, readRun } from './sync-run-state.ts'

// The shortest heartbeat pg-boss allows, so a lost worker is noticed fast.
const jobOptions = { ...syncJobOptions, heartbeatSeconds: 10 }

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const ad = (id: string, title = `Offer ${id}`): ConnectorAd =>
  toConnectorAd({ jobOfferKey: id, title })

type Fetch = (
  parameters: ScopeParameters,
  onBatch: BatchReceiver,
  signal: AbortSignal,
) => Promise<ConnectorResult>

/** A simulated source: its settings decide the scope, `fetch` the batches. */
function simulated(
  name: string,
  fetch: Fetch,
  options: { infers?: boolean; settings?: { keyword: string } } = {},
): SourceConnector {
  const settings = options.settings ?? { keyword: 'php' }
  return {
    name,
    infersUnavailabilityFromAbsence: options.infers ?? false,
    scopeParameters: () => ({ source: name, keyword: settings.keyword }),
    fetch,
  }
}

/** Hands the batches over in order, then returns the result. */
const batches =
  (list: ConnectorAd[][], result: ConnectorResult = { complete: true }) =>
  async (_: ScopeParameters, onBatch: BatchReceiver) => {
    for (const batch of list) await onBatch(batch)
    return result
  }

integration('shared sync run executor in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `run_exec_${suffix}`
  const queueSchema = `run_exec_queue_${suffix}`
  const queue = 'sync-run-executor-test'
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
      superviseIntervalSeconds: 1,
      monitorIntervalSeconds: 1,
    })
    boss.on('error', () => {})
    await boss.start()
    await boss.createQueue(queue, jobOptions)
  }, 30_000)

  beforeEach(async () => {
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

  /** Admits a run of the connector's current scope with a real queue job. */
  async function admit(connector: SourceConnector | string): Promise<string> {
    const source = typeof connector === 'string' ? connector : connector.name
    const parameters =
      typeof connector === 'string'
        ? { source, keyword: 'php' }
        : connector.scopeParameters()
    const run = await admitRun({
      source,
      parameters,
      trigger: 'manual',
      scheduleDay: '2026-11-16',
      sendJob: (runId) =>
        requireQueued(
          boss.send(queue, { runId }, { db: queueDatabase, ...jobOptions }),
        ),
    })
    return run.id
  }

  /** Claims the next queue job and executes it as the worker does. */
  async function executeNext(...connectors: SourceConnector[]) {
    const [job] = await boss.fetch<{ runId: string }>(queue)
    if (!job) throw new Error('No queued job')
    await executeSyncRun(
      {
        runId: job.data.runId,
        jobId: job.id,
        attempt: job.retryCount,
        signal: new AbortController().signal,
      },
      createConnectorRegistry(connectors),
    )
    await boss.complete(queue, job.id)
    return job
  }

  const stored = async (runId: string) =>
    (await pool.query('SELECT * FROM source_sync_runs WHERE id=$1', [runId]))
      .rows[0]
  const adIds = async () =>
    (
      await pool.query<{ external_id: string }>(
        'SELECT external_id FROM source_ads ORDER BY external_id',
      )
    ).rows.map((row) => row.external_id)
  const observed = async (runId: string) =>
    (
      await pool.query<{ external_id: string }>(
        `SELECT a.external_id FROM source_run_seen s JOIN source_ads a ON a.id=s.source_ad_id
        WHERE s.run_id=$1 ORDER BY a.external_id`,
        [runId],
      )
    ).rows.map((row) => row.external_id)

  // A5-AC02: the same scenarios pass for two sources with different names.
  describe.each(['simulated-alpha', 'simulated-beta'])('source %s', (name) => {
    it('saves one batch and completes (A5-AC01)', async () => {
      const connector = simulated(name, batches([[ad('one'), ad('two')]]))
      const runId = await admit(connector)
      await executeNext(connector)
      expect(await stored(runId)).toMatchObject({
        status: 'complete',
        pages: 1,
        seen: 2,
        revisions: 2,
        error: null,
        attempt: 0,
      })
      expect(await observed(runId)).toEqual(['one', 'two'])
    })

    it('saves many batches incrementally and completes (A5-AC01)', async () => {
      const connector = simulated(
        name,
        batches([[ad('one')], [ad('two'), ad('one')], [ad('three')]]),
      )
      const runId = await admit(connector)
      await executeNext(connector)
      expect(await stored(runId)).toMatchObject({
        status: 'complete',
        pages: 3,
        seen: 3,
      })
      expect(await adIds()).toEqual(['one', 'three', 'two'])
    })

    it('ends an incomplete result with saved ads partial, with the reason and diagnostics (A5-AC01)', async () => {
      const connector = simulated(
        name,
        batches([[ad('one')]], {
          complete: false,
          reason: 'Scope not fully checked',
          diagnostics: { stopReason: 'page_limit' },
        }),
      )
      const runId = await admit(connector)
      await executeNext(connector)
      expect(await stored(runId)).toMatchObject({
        status: 'partial',
        seen: 1,
        error: 'Scope not fully checked',
        diagnostics: { stopReason: 'page_limit' },
      })
    })

    it('ends an incomplete result without saved ads failed, even after an empty batch (A5-AC01, A5-R03)', async () => {
      const connector = simulated(
        name,
        batches([[]], { complete: false, reason: 'Invalid page' }),
      )
      const runId = await admit(connector)
      await executeNext(connector)
      expect(await stored(runId)).toMatchObject({
        status: 'failed',
        pages: 1,
        seen: 0,
        error: 'Invalid page',
      })
    })

    it('completes a complete result without ads (A5-AC01)', async () => {
      const connector = simulated(name, batches([]))
      const runId = await admit(connector)
      await executeNext(connector)
      expect(await stored(runId)).toMatchObject({ status: 'complete', seen: 0 })
    })

    it('fetches with the settings saved at admission (A5-AC03)', async () => {
      const settings = { keyword: 'php' }
      const fetch = vi.fn(batches([[ad('one')]]))
      const connector = simulated(name, fetch, { settings })
      const runId = await admit(connector)
      settings.keyword = 'java'
      expect(connector.scopeParameters()).toEqual({
        source: name,
        keyword: 'java',
      })
      await executeNext(connector)
      expect(fetch.mock.calls[0]![0]).toEqual({ source: name, keyword: 'php' })
      expect(await stored(runId)).toMatchObject({ status: 'complete' })
    })

    it('keeps the saved batch and its observations after a later fetch error (A5-AC04)', async () => {
      const connector = simulated(name, async (_, onBatch) => {
        await onBatch([ad('one')])
        throw new ConnectorError('Source HTTP 503')
      })
      const runId = await admit(connector)
      await executeNext(connector)
      expect(await stored(runId)).toMatchObject({
        status: 'partial',
        seen: 1,
        error: 'Source HTTP 503',
      })
      expect(await observed(runId)).toEqual(['one'])
    })

    it('never completes a run whose batch save failed (A5-AC04)', async () => {
      await pool.query(
        `ALTER TABLE source_ad_revisions ADD CONSTRAINT reject_fixture CHECK (payload->>'title' <> 'Rejected')`,
      )
      try {
        // A connector that swallows the save error and reports the whole
        // scope as checked.
        const swallowing = simulated(name, async (_, onBatch) => {
          await onBatch([ad('one')])
          await onBatch([ad('two', 'Rejected')]).catch(() => {})
          return { complete: true }
        })
        const partial = await admit(swallowing)
        await executeNext(swallowing)
        expect(await stored(partial)).toMatchObject({
          status: 'partial',
          seen: 1,
          error: 'Import interrupted by a storage or processing error',
        })
        expect(await adIds()).toEqual(['one'])

        const first = simulated(
          name,
          batches([[ad('three', 'Rejected')], [ad('four')]]),
        )
        const failed = await admit(first)
        await executeNext(first)
        expect(await stored(failed)).toMatchObject({
          status: 'failed',
          seen: 0,
          error: 'Import interrupted by a storage or processing error',
        })
      } finally {
        await pool.query(
          'ALTER TABLE source_ad_revisions DROP CONSTRAINT reject_fixture',
        )
      }
    })

    it('fails the run of an unknown source with the name only (A5-AC05)', async () => {
      const runId = await admit(name)
      await executeNext(simulated('another-source', batches([[ad('one')]])))
      expect(await stored(runId)).toMatchObject({
        status: 'failed',
        error: `Unknown source: ${name}`,
        seen: 0,
      })
    })

    it('fails the run with invalid settings without storing secrets (A5-AC05)', async () => {
      const invalid = simulated(name, async () => {
        throw new ConnectorError('Invalid source settings')
      })
      const first = await admit(invalid)
      await executeNext(invalid)
      expect(await stored(first)).toMatchObject({
        status: 'failed',
        error: 'Invalid source settings',
      })
      const leaking = simulated(name, async () => {
        throw new Error('password=SECRET in postgres://user:SECRET@host')
      })
      const second = await admit(leaking)
      await executeNext(leaking)
      const run = await stored(second)
      expect(run).toMatchObject({
        status: 'failed',
        error: 'Import interrupted by a storage or processing error',
      })
      expect(JSON.stringify(run)).not.toContain('SECRET')
    })

    it('leaves a finished run unchanged on redelivery (A5-AC08)', async () => {
      const connector = simulated(name, batches([[ad('one')]]))
      const runId = await admit(connector)
      const job = await executeNext(connector)
      const before = await stored(runId)
      const late = vi.fn(batches([[ad('late')]]))
      for (const attempt of [0, 1])
        await executeSyncRun(
          {
            runId,
            jobId: job.id,
            attempt,
            signal: new AbortController().signal,
          },
          createConnectorRegistry([simulated(name, late)]),
        )
      expect(late).not.toHaveBeenCalled()
      expect(await stored(runId)).toEqual(before)
    })
  })

  it('marks unseen ads of the scope unavailable together with completion only for a connector inferring from absence (A5-AC10)', async () => {
    for (const [name, infers] of [
      ['simulated-infers', true],
      ['simulated-keeps', false],
    ] as const) {
      const first = simulated(name, batches([[ad('one'), ad('two')]]), {
        infers,
      })
      await admit(first)
      await executeNext(first)
      const partial = simulated(
        name,
        batches([[ad('one')]], { complete: false, reason: 'Incomplete' }),
        { infers },
      )
      await admit(partial)
      await executeNext(partial)
      const complete = simulated(name, batches([[ad('one')]]), { infers })
      await admit(complete)
      await executeNext(complete)
    }
    expect(
      (
        await pool.query(
          'SELECT source,external_id,availability FROM source_ads ORDER BY source,external_id',
        )
      ).rows,
    ).toEqual([
      {
        source: 'simulated-infers',
        external_id: 'one',
        availability: 'available',
      },
      {
        source: 'simulated-infers',
        external_id: 'two',
        availability: 'unavailable',
      },
      {
        source: 'simulated-keeps',
        external_id: 'one',
        availability: 'available',
      },
      {
        source: 'simulated-keeps',
        external_id: 'two',
        availability: 'available',
      },
    ])
  })

  // ASM-4: the run's own source selects the connector, not the delivery.
  it('executes a delivered run with the connector of its own source (ASM-4)', async () => {
    const alpha = vi.fn(batches([[ad('alpha')]]))
    const beta = vi.fn(batches([[ad('beta')]]))
    const runId = await admit(simulated('simulated-beta', beta))
    await executeNext(
      simulated('simulated-alpha', alpha),
      simulated('simulated-beta', beta),
    )
    expect(alpha).not.toHaveBeenCalled()
    expect(await stored(runId)).toMatchObject({ status: 'complete', seen: 1 })
    expect(await adIds()).toEqual(['beta'])
  })

  it('stops an attempt whose signal is aborted without finishing the run', async () => {
    const stop = new AbortController()
    const connector = simulated('simulated-alpha', async (_, onBatch) => {
      await onBatch([ad('one')])
      stop.abort()
      throw new Error('aborted fetch')
    })
    const runId = await admit(connector)
    const [job] = await boss.fetch<{ runId: string }>(queue)
    await expect(
      executeSyncRun(
        { runId, jobId: job!.id, attempt: 0, signal: stop.signal },
        createConnectorRegistry([connector]),
      ),
    ).rejects.toThrow('aborted fetch')
    expect(await stored(runId)).toMatchObject({
      status: 'running',
      seen: 1,
      attempt: 0,
    })
  })

  it('continues a run after losing its worker; the lost attempt writes nothing more (A5-AC06, A5-AC07)', async () => {
    const name = 'simulated-alpha'
    let lostAttemptSaved!: () => void
    const saved = new Promise<void>((resolve) => {
      lostAttemptSaved = resolve
    })
    let resumeLostAttempt!: () => void
    const resume = new Promise<void>((resolve) => {
      resumeLostAttempt = resolve
    })
    const lostConnector = simulated(name, async (_, onBatch) => {
      await onBatch([ad('one'), ad('two')])
      lostAttemptSaved()
      await resume
      await onBatch([ad('from-lost-attempt')])
      return { complete: true }
    })
    const runId = await admit(lostConnector)
    // Worker A claims the job and stops sending heartbeats: it was lost.
    const [job] = await boss.fetch<{ runId: string }>(queue)
    const lost = executeSyncRun(
      {
        runId,
        jobId: job!.id,
        attempt: job!.retryCount,
        signal: new AbortController().signal,
      },
      createConnectorRegistry([lostConnector]),
    )
    await saved
    // Worker B receives the retried job once the heartbeat expires.
    const retried = new Promise<number>((resolve, reject) => {
      void boss
        .work<{ runId: string }>(
          queue,
          { pollingIntervalSeconds: 0.5 },
          async ([next]) => {
            await executeSyncRun(
              {
                runId: next!.data.runId,
                jobId: next!.id,
                attempt: next!.retryCount,
                signal: next!.signal,
              },
              createConnectorRegistry([
                simulated(name, batches([[ad('one'), ad('two'), ad('three')]])),
              ]),
            )
            resolve(next!.retryCount)
          },
        )
        .catch(reject)
    })
    expect(await retried).toBe(1)
    await boss.offWork(queue)
    expect(await stored(runId)).toMatchObject({
      status: 'complete',
      attempt: 1,
      seen: 3,
    })
    const finished = await stored(runId)
    resumeLostAttempt()
    await expect(lost).rejects.toBeInstanceOf(SyncRunLostError)
    expect(await stored(runId)).toEqual(finished)
    expect(await adIds()).toEqual(['one', 'three', 'two'])
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM source_sync_runs'))
        .rows[0].n,
    ).toBe(1)
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM source_run_seen'))
        .rows[0].n,
    ).toBe(3)
  }, 60_000)

  it('ends unfinished runs without active queue work with an interruption message (A5-AC09)', async () => {
    const connector = simulated('simulated-alpha', batches([]))
    const findJob = ({ jobId }: { jobId: string }) =>
      boss.getJobById(queue, jobId)
    // Running with saved ads, its job has failed for good.
    const withAds = await admit(connector)
    await pool.query(
      "UPDATE source_sync_runs SET status='running',attempt=0,seen=2 WHERE id=$1",
      [withAds],
    )
    await boss.cancel(queue, (await stored(withAds)).job_id)
    // Running without ads, its job is gone.
    const gone = await admit(simulated('simulated-beta', batches([])))
    await pool.query(
      "UPDATE source_sync_runs SET status='running',attempt=0 WHERE id=$1",
      [gone],
    )
    await admin.query(`DELETE FROM ${queueSchema}.job WHERE id=$1`, [
      (await stored(gone)).job_id,
    ])
    // Running with its job active, and queued with its job waiting.
    const active = await admit(simulated('simulated-gamma', batches([])))
    const [activeJob] = await boss.fetch<{ runId: string }>(queue)
    await pool.query(
      "UPDATE source_sync_runs SET status='running',attempt=0 WHERE id=$1",
      [activeJob!.data.runId],
    )
    const waiting = await admit(simulated('simulated-delta', batches([])))

    await Promise.all([recoverSyncRuns(findJob), recoverSyncRuns(findJob)])

    expect(await stored(withAds)).toMatchObject({
      status: 'partial',
      error: 'Worker interrupted; request a new import',
    })
    expect(await stored(gone)).toMatchObject({
      status: 'failed',
      error: 'Worker interrupted; request a new import',
    })
    expect((await stored(active)).status).toBe('running')
    expect((await stored(waiting)).status).toBe('queued')
  })

  it('executes a run without a queue job in the calling process (A5-R08)', async () => {
    const connector = simulated('simulated-alpha', batches([[ad('one')]]))
    const run = await runSyncInProcess(
      {
        source: 'simulated-alpha',
        scheduleDay: '2026-11-16',
        signal: new AbortController().signal,
      },
      createConnectorRegistry([connector]),
    )
    expect(run).toMatchObject({
      status: 'complete',
      jobId: null,
      attempt: 0,
      uniqueAds: 1,
    })
    expect(await readRun(run.id)).toEqual(run)
  })

  it('ends a run stopped in the calling process as interrupted (A5-R08, F2-13)', async () => {
    const stop = new AbortController()
    const connector = simulated('simulated-alpha', async (_, onBatch) => {
      await onBatch([ad('one')])
      stop.abort()
      throw new Error('aborted fetch')
    })
    await expect(
      runSyncInProcess(
        {
          source: 'simulated-alpha',
          scheduleDay: '2026-11-16',
          signal: stop.signal,
        },
        createConnectorRegistry([connector]),
      ),
    ).rejects.toThrow('aborted fetch')
    expect(
      (await pool.query('SELECT status,seen,error FROM source_sync_runs')).rows,
    ).toEqual([
      {
        status: 'partial',
        seen: 1,
        error: 'Import interrupted; request a new import',
      },
    ])
  })

  // A run executed without a queue has no job telling whether its process is
  // alive; recovery leaves it for inProcessRunLimitSeconds (owner decision
  // 2026-11-17).
  it('leaves a running run without a queue job to its process for inProcessRunLimitSeconds', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const connector = simulated('simulated-alpha', async (_, onBatch) => {
      await onBatch([ad('one')])
      entered()
      await gate
      return { complete: true }
    })
    const execution = runSyncInProcess(
      {
        source: 'simulated-alpha',
        scheduleDay: '2026-11-16',
        signal: new AbortController().signal,
      },
      createConnectorRegistry([connector]),
    )
    await started
    const findJob = vi.fn()
    await recoverSyncRuns(findJob)
    expect(findJob).not.toHaveBeenCalled()
    release()
    expect(await execution).toMatchObject({ status: 'complete' })

    // A process that died: the run stays running without a job.
    const orphan = await runSyncInProcess(
      {
        source: 'simulated-beta',
        scheduleDay: '2026-11-16',
        signal: new AbortController().signal,
      },
      createConnectorRegistry([simulated('simulated-beta', batches([]))]),
    )
    await pool.query(
      "UPDATE source_sync_runs SET status='running',finished_at=NULL,seen=0 WHERE id=$1",
      [orphan.id],
    )
    const startedAt = (await readRun(orphan.id))!.startedAt!
    await recoverSyncRuns(
      findJob,
      new Date(
        startedAt.getTime() + (inProcessRunLimitSeconds - 1) * 1000,
      ),
    )
    expect((await readRun(orphan.id))!.status).toBe('running')
    await recoverSyncRuns(
      findJob,
      new Date(startedAt.getTime() + inProcessRunLimitSeconds * 1000),
    )
    expect(await readRun(orphan.id)).toMatchObject({
      status: 'failed',
      error: 'Import interrupted; request a new import',
    })
  })

  it('finishes a run left by a dead process when the next in-process run of the source starts, without a worker', async () => {
    const registry = createConnectorRegistry([
      simulated('simulated-alpha', batches([[ad('one')]])),
    ])
    const request = {
      source: 'simulated-alpha',
      scheduleDay: '2026-11-17',
      signal: new AbortController().signal,
    }
    // A process that died: its run stays running without a job.
    const orphan = await runSyncInProcess(request, registry)
    await pool.query(
      "UPDATE source_sync_runs SET status='running',finished_at=NULL,started_at=now() WHERE id=$1",
      [orphan.id],
    )

    await expect(runSyncInProcess(request, registry)).rejects.toBeInstanceOf(
      SyncRunAlreadyActiveError,
    )
    expect((await readRun(orphan.id))!.status).toBe('running')

    await pool.query(
      `UPDATE source_sync_runs SET started_at=now()-make_interval(secs=>$2) WHERE id=$1`,
      [orphan.id, inProcessRunLimitSeconds],
    )
    const next = await runSyncInProcess(request, registry)

    expect(next).toMatchObject({ status: 'complete' })
    expect(await readRun(orphan.id)).toMatchObject({
      status: 'partial',
      error: 'Import interrupted; request a new import',
    })
  })
})
