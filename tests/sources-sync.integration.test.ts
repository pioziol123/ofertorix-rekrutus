import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  applyQueueConfiguration,
  sendJob,
  stopQueues,
} from '../lib/queues/index.ts'
import {
  requestScheduledSyncs,
  requestSync,
  SourceDisabledError,
  syncJob,
  UnknownConnectorError,
} from '../modules/sources/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { saveBatch } from '../modules/sources/save-batch.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { toConnectorAd } from '../modules/sources/infrastructure/adapters/connector.ts'
import {
  planFetches,
  planTables,
  testConnectors,
} from './fixtures/sources/connectors.ts'
import { prepareSyncRunQueue, sourcesMigrations } from './sync-run.fixtures.ts'
import { waitFor } from './worker.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const interrupted = 'Worker interrupted; request a new import'
const queue = syncJob.queue
const failureQueue = `${queue}.failed`
const connectors = testConnectors

const workerEntry = fileURLToPath(
  new URL('./fixtures/sources/worker.ts', import.meta.url),
)

type RunRow = {
  id: string
  status: string
  trigger: string
  pages: number
  seen: number
  error: string | null
  started_at: Date | null
  finished_at: Date | null
}

type JobRow = {
  id: string
  name: string
  state: string
  retry_count: number
  singleton_key: string | null
  data: Record<string, unknown>
  output: { reason?: string; message?: string } | null
}

// B5: requesting and carrying out ad syncs through the queue and worker
// libraries, with test connectors in a worker started as in production.
integration('ad syncs through the queue and worker libraries', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16),
    schema = `srcsync_${suffix}`,
    queueSchema = `srcsync_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool, boss: PgBoss, url: string
  const workers: ChildProcess[] = []

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    url = connection.toString()
    pool = new Pool({ connectionString: url, max: 8 })
    for (const migration of sourcesMigrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    await pool.query(planTables)
    await pool.query(`CREATE TABLE service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    )`)
    setPool(pool)
    await prepareSyncRunQueue(queueSchema)
    process.env.PG_BOSS_SCHEMA = queueSchema
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
      supervise: false,
      schedule: false,
    })
    boss.on('error', () => {})
    await boss.start()
  }, 60_000)

  afterAll(async () => {
    for (const child of workers) await kill(child)
    await boss?.stop({ graceful: false })
    await stopQueues()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  }, 60_000)

  async function kill(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGKILL')
    await once(child, 'exit')
  }

  /** Starts a worker of the test plugins on the test schemas, pool size 2. */
  async function startWorker() {
    let output = ''
    const child = spawn(process.execPath, ['--import', 'tsx', workerEntry], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        PG_BOSS_SCHEMA: queueSchema,
        WORKER_POOL_SIZE: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
    workers.push(child)
    await waitFor(
      async () => {
        if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`)
        return output.includes('Worker ready')
      },
      30_000,
      'the worker to be ready',
    )
    return child
  }

  const request = (source: string, scope?: string) =>
    requestSync(
      { source, scopeRequest: scope === undefined ? undefined : { scope } },
      { connectors },
    )

  const runOf = async (id: string): Promise<RunRow> =>
    (
      await pool.query(
        `SELECT id,status,trigger,pages,seen,error,started_at,finished_at
         FROM source_sync_runs WHERE id=$1`,
        [id],
      )
    ).rows[0]

  const runCount = async () =>
    (await pool.query('SELECT count(*)::int AS n FROM source_sync_runs'))
      .rows[0].n as number

  const jobsOf = async (runId: string, name = queue): Promise<JobRow[]> =>
    (
      await admin.query(
        `SELECT id,name,state,retry_count,singleton_key,data,output
         FROM ${queueSchema}.job WHERE name=$1 AND data->>'runId'=$2
         ORDER BY created_on`,
        [name, runId],
      )
    ).rows

  const jobCount = async () =>
    (
      await admin.query(
        `SELECT count(*)::int AS n FROM ${queueSchema}.job WHERE name=$1`,
        [queue],
      )
    ).rows[0].n as number

  const statusBecomes = (id: string, status: string, timeoutMs = 60_000) =>
    waitFor(
      async () => {
        const run = await runOf(id)
        return run.status === status && run
      },
      timeoutMs,
      `run ${id} to become ${status}`,
    )

  const jobCompleted = (runId: string, name = queue) =>
    waitFor(
      async () =>
        (await jobsOf(runId, name)).find((job) => job.state === 'completed'),
      60_000,
      `the ${name} job of run ${runId} to complete`,
    )

  const availabilityOf = async (source: string, externalId: string) =>
    (
      await pool.query(
        'SELECT availability FROM source_ads WHERE source=$1 AND external_id=$2',
        [source, externalId],
      )
    ).rows[0]?.availability as string | undefined

  /** Ends the run as the test, as if something else finished it. */
  const endRun = (id: string) =>
    pool.query(
      "UPDATE source_sync_runs SET status='failed',error='Ended by the test',finished_at=now() WHERE id=$1",
      [id],
    )

  describe('requests', () => {
    it('returns the identifier of a waiting sync with its job in the queue, keyed by its source (B5-AC01)', async () => {
      const requested = await request('test-1', 'a')
      expect(requested.existing).toBe(false)
      expect(await runOf(requested.id)).toMatchObject({
        status: 'queued',
        trigger: 'manual',
      })
      expect(await jobsOf(requested.id)).toMatchObject([
        {
          state: 'created',
          singleton_key: 'test-1',
          data: { runId: requested.id, source: 'test-1' },
        },
      ])
      await endRun(requested.id)
    })

    it('refuses an unknown source, a disabled source and invalid settings, leaving no sync and no job (B5-AC01)', async () => {
      const [runs, jobs] = [await runCount(), await jobCount()]
      await expect(request('no-such-source')).rejects.toThrow(
        UnknownConnectorError,
      )
      await expect(request('test-disabled')).rejects.toThrow(
        SourceDisabledError,
      )
      await expect(request('test-2', '')).rejects.toThrow(
        'Invalid sync settings',
      )
      expect([await runCount(), await jobCount()]).toEqual([runs, jobs])
    })

    it('returns the waiting and then the running sync of the source for the same and another scope, creating no sync or job (B5-AC02)', async () => {
      const waiting = await request('test-2', 'a')
      const [runs, jobs] = [await runCount(), await jobCount()]
      for (const scope of ['a', 'b'])
        expect(await request('test-2', scope)).toEqual({
          id: waiting.id,
          existing: true,
        })
      await pool.query(
        "UPDATE source_sync_runs SET status='running',started_at=now() WHERE id=$1",
        [waiting.id],
      )
      for (const scope of ['a', 'b'])
        expect(await request('test-2', scope)).toEqual({
          id: waiting.id,
          existing: true,
        })
      expect([await runCount(), await jobCount()]).toEqual([runs, jobs])
      await endRun(waiting.id)
    })

    // ASSUMPTION(oferty-pracy-2ba.5/ASM-1): of several unfinished syncs a
    // source holds from before B5, a request returns the running one, else
    // the oldest waiting one.
    it('returns the running sync, else the oldest waiting one, of a source holding several unfinished syncs from before (B5-AC02, ASM-1)', async () => {
      const oldest = await request('test-5', 'legacy-a')
      // Requested under the former rules: more unfinished syncs of the
      // source, in other scopes.
      const scopes = [randomUUID(), randomUUID()]
      for (const scope of scopes)
        await pool.query(
          `INSERT INTO source_scopes(id,source,fingerprint,parameters)
           VALUES ($1::uuid,'test-5',$1::text,'{}')`,
          [scope],
        )
      const [waiting, running] = [randomUUID(), randomUUID()]
      await pool.query(
        `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day,status)
         VALUES ($1,$2,'manual','2026-11-18','queued')`,
        [waiting, scopes[0]],
      )
      expect(await request('test-5', 'legacy-d')).toEqual({
        id: oldest.id,
        existing: true,
      })
      await pool.query(
        `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day,status,started_at)
         VALUES ($1,$2,'manual','2026-11-18','running',now())`,
        [running, scopes[1]],
      )
      expect(await request('test-5', 'legacy-a')).toEqual({
        id: running,
        existing: true,
      })
      for (const id of [oldest.id, waiting, running]) await endRun(id)
    })

    it('creates one sync and one job for ten requests of one source at once (B5-AC02)', async () => {
      const [runs, jobs] = [await runCount(), await jobCount()]
      const requested = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          request('test-3', index % 2 ? 'a' : 'b'),
        ),
      )
      expect(new Set(requested.map((run) => run.id)).size).toBe(1)
      expect(requested.filter((run) => !run.existing)).toHaveLength(1)
      expect([await runCount(), await jobCount()]).toEqual([runs + 1, jobs + 1])
      await endRun(requested[0]!.id)
    })

    it('requests one sync per schedule occurrence for a scheduled source, none when the occurrence is checked again and none for a source with an unfinished sync (B5-AC06)', async () => {
      const day = new Date('2026-11-18T12:00:00Z'),
        nextDay = new Date('2026-11-19T12:00:00Z')
      const [scheduled] = await requestScheduledSyncs({ connectors, now: day })
      expect(scheduled).toMatchObject({ existing: false })
      expect(await runOf(scheduled!.id)).toMatchObject({
        status: 'queued',
        trigger: 'scheduled',
      })
      expect(await jobsOf(scheduled!.id)).toHaveLength(1)
      // Only the enabled scheduled source was requested.
      expect(await requestScheduledSyncs({ connectors, now: day })).toEqual([])
      await endRun(scheduled!.id)
      // The occurrence has its sync, also after it finished.
      expect(await requestScheduledSyncs({ connectors, now: day })).toEqual([])

      // A manual sync still waits on the next occurrence: nothing is
      // requested, and the occurrence is requested once it has finished.
      const manual = await request('test-scheduled')
      const runs = await runCount()
      expect(await requestScheduledSyncs({ connectors, now: nextDay })).toEqual(
        [],
      )
      expect(await runCount()).toBe(runs)
      await endRun(manual.id)
      const [next] = await requestScheduledSyncs({ connectors, now: nextDay })
      expect(await runOf(next!.id)).toMatchObject({ trigger: 'scheduled' })
      await endRun(next!.id)
    })
  })

  describe('with the worker', () => {
    let worker: ChildProcess

    beforeAll(async () => {
      worker = await startWorker()
    }, 60_000)

    it('saves the batches of a requested sync, ends it complete and assesses availability (B5-AC03)', async () => {
      await planFetches(
        'availability',
        { batches: [['old', 'stays']], end: 'complete' },
        { batches: [['stays'], ['new']], end: 'complete' },
      )
      const first = await request('test-4', 'availability')
      await statusBecomes(first.id, 'complete')
      const second = await request('test-4', 'availability')
      expect(second.existing).toBe(false)
      expect(await statusBecomes(second.id, 'complete')).toMatchObject({
        pages: 2,
        seen: 2,
        error: null,
      })
      expect(await availabilityOf('test-4', 'old')).toBe('unavailable')
      expect(await availabilityOf('test-4', 'stays')).toBe('available')
      expect(await availabilityOf('test-4', 'new')).toBe('available')
      expect(await jobsOf(second.id)).toMatchObject([
        { state: 'completed', retry_count: 0 },
      ])
    }, 120_000)

    it('ends a sync partial or failed with the saved message after a connector error (B5-AC03)', async () => {
      await planFetches('error-saved', {
        batches: [['e1']],
        end: 'connector-error',
      })
      await planFetches('error-empty', { batches: [], end: 'connector-error' })
      const saved = await request('test-5', 'error-saved')
      expect(await statusBecomes(saved.id, 'partial')).toMatchObject({
        seen: 1,
        error: 'Portal answered HTTP 500',
      })
      const empty = await request('test-5', 'error-empty')
      expect(await statusBecomes(empty.id, 'failed')).toMatchObject({
        seen: 0,
        error: 'Portal answered HTTP 500',
      })
    }, 120_000)

    it('saves no further batch of a sync ended in between, and its job completes (B5-AC03)', async () => {
      await planFetches('ended', {
        batches: [['x1'], ['x2']],
        pauseMs: 3_000,
        end: 'complete',
      })
      const requested = await request('test-6', 'ended')
      await waitFor(
        async () => (await runOf(requested.id)).pages === 1,
        60_000,
        'the first batch',
      )
      await endRun(requested.id)
      await jobCompleted(requested.id)
      expect(await runOf(requested.id)).toMatchObject({
        status: 'failed',
        error: 'Ended by the test',
        pages: 1,
        seen: 1,
      })
      expect(await availabilityOf('test-6', 'x2')).toBeUndefined()
    }, 120_000)

    it('carries out the syncs of two sources at the same time with pool size 2 (B5-AC02)', async () => {
      for (const scope of ['parallel-7', 'parallel-8'])
        await planFetches(scope, {
          batches: [[scope]],
          pauseMs: 4_000,
          end: 'complete',
        })
      const [seventh, eighth] = await Promise.all([
        request('test-7', 'parallel-7'),
        request('test-8', 'parallel-8'),
      ])
      const [a, b] = [
        await statusBecomes(seventh.id, 'complete'),
        await statusBecomes(eighth.id, 'complete'),
      ]
      expect(a.started_at!.getTime()).toBeLessThan(b.finished_at!.getTime())
      expect(b.started_at!.getTime()).toBeLessThan(a.finished_at!.getTime())
    }, 120_000)

    it('continues a sync whose attempt failed as the same sync, keeping the ads saved before, and a job for a finished sync changes nothing (B5-AC04)', async () => {
      await planFetches(
        'retried',
        { batches: [['r1']], end: 'throw' },
        { batches: [['r2']], end: 'complete' },
      )
      const requested = await request('test-1', 'retried')
      // The second attempt found the sync running and took it over.
      expect(await statusBecomes(requested.id, 'complete')).toMatchObject({
        pages: 2,
        seen: 2,
        error: null,
      })
      expect(await jobsOf(requested.id)).toMatchObject([
        { state: 'completed', retry_count: 1 },
      ])

      const finished = await runOf(requested.id)
      await sendJob(syncJob, { runId: requested.id, source: 'test-1' })
      await waitFor(
        async () =>
          (await jobsOf(requested.id)).filter(
            (job) => job.state === 'completed',
          ).length === 2,
        60_000,
        'the job for the finished sync to complete',
      )
      expect(await runOf(requested.id)).toEqual(finished)
    }, 120_000)

    it('ends a sync partial with saved ads and failed without, with the message, after its last attempt throws (B5-AC05)', async () => {
      const throwing = { batches: [['t1']], end: 'throw' } as const
      await planFetches('throws-saved', throwing, throwing, throwing)
      const empty = { batches: [], end: 'throw' } as const
      await planFetches('throws-empty', empty, empty, empty)
      const saved = await request('test-2', 'throws-saved')
      const none = await request('test-3', 'throws-empty')
      expect(await statusBecomes(saved.id, 'partial')).toMatchObject({
        seen: 1,
        error: interrupted,
      })
      expect(await statusBecomes(none.id, 'failed')).toMatchObject({
        seen: 0,
        error: interrupted,
      })
      for (const id of [saved.id, none.id]) {
        expect(await jobsOf(id)).toMatchObject([
          { state: 'failed', retry_count: 2 },
        ])
        await jobCompleted(id, failureQueue)
      }
    }, 120_000)

    it('the failure handler leaves a sync finished in between unchanged (B5-AC05)', async () => {
      await planFetches('finished', { batches: [['f1']], end: 'complete' })
      const requested = await request('test-4', 'finished')
      const finished = await statusBecomes(requested.id, 'complete')
      await boss.send(failureQueue, { runId: requested.id, source: 'test-4' })
      await jobCompleted(requested.id, failureQueue)
      expect(await runOf(requested.id)).toEqual(finished)
    }, 120_000)

    describe('with one attempt', () => {
      // The queue's settings are taken by each job when it is requested.
      beforeAll(() =>
        applyQueueConfiguration({
          [queue]: { attempts: 1, timeLimitSeconds: 4 },
        }),
      )
      afterAll(() => prepareSyncRunQueue(queueSchema))

      it('ends a sync partial with saved ads and failed without, with the message, after its attempt passed its time limit (B5-AC05)', async () => {
        await planFetches('slow-saved', { batches: [['s1']], end: 'hang' })
        await planFetches('slow-empty', { batches: [], end: 'hang' })
        const saved = await request('test-5', 'slow-saved')
        const none = await request('test-6', 'slow-empty')
        expect(await statusBecomes(saved.id, 'partial')).toMatchObject({
          seen: 1,
          error: interrupted,
        })
        expect(await statusBecomes(none.id, 'failed')).toMatchObject({
          seen: 0,
          error: interrupted,
        })
        for (const id of [saved.id, none.id])
          expect(await jobsOf(id)).toMatchObject([
            { state: 'failed', output: { reason: 'time-limit' } },
          ])
      }, 120_000)

      it('ends a sync partial with saved ads and failed without, with the message, after the worker is killed during its last attempt (B5-AC05)', async () => {
        await applyQueueConfiguration({
          [queue]: { attempts: 1, timeLimitSeconds: 3600 },
        })
        await planFetches('killed-saved', { batches: [['k1']], end: 'hang' })
        await planFetches('killed-empty', { batches: [], end: 'hang' })
        const saved = await request('test-7', 'killed-saved')
        const none = await request('test-8', 'killed-empty')
        await waitFor(
          async () =>
            (await runOf(saved.id)).pages === 1 &&
            (await runOf(none.id)).status === 'running' &&
            (await jobsOf(none.id))[0]?.state === 'active',
          60_000,
          'both syncs to run',
        )
        await kill(worker)
        worker = await startWorker()
        expect(await statusBecomes(saved.id, 'partial', 150_000)).toMatchObject(
          { seen: 1, error: interrupted },
        )
        expect(await statusBecomes(none.id, 'failed', 150_000)).toMatchObject({
          seen: 0,
          error: interrupted,
        })
      }, 360_000)
    })

    it('carries the waiting and running syncs over to the new queue at the migration step: a waiting one is carried out, a running one taken over keeping its saved ads, finished ones unchanged, the former queue removed (B5-AC07, B5-AC08)', async () => {
      // Before the deployment: the former worker is stopped and the syncs
      // have no job in the new queue.
      await kill(worker)
      const waiting = await request('test-1', 'carried-waiting')
      const running = await request('test-2', 'carried-running')
      await admin.query(
        `DELETE FROM ${queueSchema}.job WHERE name=$1 AND data->>'runId' = ANY($2)`,
        [queue, [waiting.id, running.id]],
      )
      await pool.query(
        "UPDATE source_sync_runs SET status='running',started_at=now()-interval '1 hour' WHERE id=$1",
        [running.id],
      )
      const scopeId = (
        await pool.query('SELECT scope_id FROM source_sync_runs WHERE id=$1', [
          running.id,
        ])
      ).rows[0].scope_id
      await saveBatch({ id: running.id, scopeId, source: 'test-2' }, [
        toConnectorAd({ jobOfferKey: 'before', url: null }),
      ])
      const runningBefore = await runOf(running.id)
      const finishedBefore = (
        await pool.query(
          "SELECT * FROM source_sync_runs WHERE status NOT IN ('queued','running') ORDER BY id",
        )
      ).rows
      await planFetches('carried-waiting', {
        batches: [['w1']],
        end: 'complete',
      })
      await planFetches('carried-running', {
        batches: [['after']],
        end: 'complete',
      })
      // The queue of the former path, with a job waiting in it.
      await boss.createQueue('source-sync', { retryLimit: 2 })
      await boss.send('source-sync', { runId: waiting.id })

      const carryOver = () =>
        promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', 'scripts/carry-over-jobs.ts'],
          {
            env: {
              ...process.env,
              DATABASE_URL: url,
              PG_BOSS_SCHEMA: queueSchema,
            },
          },
        )
      expect((await carryOver()).stdout).toContain(
        'Carried 2 jobs over from queue "source-sync"',
      )
      expect(await boss.getQueue('source-sync')).toBeFalsy()
      expect(await jobsOf(waiting.id)).toHaveLength(1)
      expect(await jobsOf(running.id)).toHaveLength(1)

      worker = await startWorker()
      expect(await statusBecomes(waiting.id, 'complete')).toMatchObject({
        seen: 1,
      })
      expect(await statusBecomes(running.id, 'complete')).toMatchObject({
        pages: 2,
        seen: 2,
        started_at: runningBefore.started_at,
      })
      expect(await availabilityOf('test-2', 'before')).toBe('available')
      expect(
        (
          await pool.query(
            'SELECT * FROM source_sync_runs WHERE id = ANY($1) ORDER BY id',
            [finishedBefore.map((run) => run.id)],
          )
        ).rows,
      ).toEqual(finishedBefore)

      // The former queue is gone, so a second run carries nothing over.
      expect((await carryOver()).stdout).not.toContain('Carried')
    }, 180_000)
  })
})
