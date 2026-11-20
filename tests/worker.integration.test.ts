import { execFile } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  alive,
  createScenario,
  waitFor,
  waitForReady,
  type Scenario,
  type TestWorker,
  type WorkerEvent,
} from './worker.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
const run = promisify(execFile)

/** The most jobs whose start and end events overlap at one moment. */
function mostAtOnce(events: WorkerEvent[]): number {
  let current = 0
  let most = 0
  for (const event of events) {
    if (event.kind === 'start') most = Math.max(most, ++current)
    if (event.kind === 'end') current--
  }
  return most
}

/** Start and end of each job's first run. */
function spans(events: WorkerEvent[]) {
  const result = new Map<string, { start: number; end: number }>()
  for (const event of events) {
    if (!event.job_id) continue
    const span = result.get(event.job_id) ?? { start: 0, end: 0 }
    if (event.kind === 'start' && !span.start) span.start = +event.at
    if (event.kind === 'end' && !span.end) span.end = +event.at
    result.set(event.job_id, span)
  }
  return result
}

const overlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
) => a.start < b.end && b.start < a.end

integration('worker library: taking and carrying out jobs', () => {
  let scenario: Scenario
  let worker: TestWorker

  beforeAll(async () => {
    scenario = await createScenario('wk_main')
    // A queue of the existing path, which the worker leaves to it (B1-D16).
    await scenario.boss.createQueue('ai-execution')
    // No pool size set: the worker uses 2 (B1-AC07).
    worker = scenario.startWorker()
    await waitForReady(worker)
  }, 60_000)

  afterAll(async () => {
    await scenario?.drop()
  }, 30_000)

  it('runs the module plugins in the worker and in each pool process, with pool size 2 by default (B1-AC07, B1-AC15)', async () => {
    expect(worker.output()).toContain('Worker ready: 2 pool processes')
    const plugins = (await scenario.events()).filter(
      (event) => event.kind === 'plugin',
    )
    expect(new Set(plugins.map((event) => event.pid)).size).toBe(3)
    expect(plugins.map((event) => event.pid)).toContain(worker.child.pid)
  })

  it('takes from two queues in turn and carries out at most two of five jobs at once (B1-AC07)', async () => {
    const ids = ['a1', 'a2', 'a3', 'b1', 'b2'].map((id) => `turn-${id}`)
    // Three on one queue first, then two on the other: taken in turn.
    for (const id of ids.slice(0, 3))
      await scenario.send('wt-plain', { id, action: 'ok', ms: 1500 })
    for (const id of ids.slice(3))
      await scenario.send('wt-second', { id, action: 'ok', ms: 1500 })
    await waitFor(
      async () =>
        (await scenario.events()).filter(
          (event) => event.kind === 'end' && ids.includes(event.job_id!),
        ).length === 5,
      30_000,
      'five jobs to end',
    )
    const events = (await scenario.events()).filter((event) =>
      ids.includes(event.job_id!),
    )
    expect(mostAtOnce(events)).toBe(2)
    const starts = events
      .filter((event) => event.kind === 'start')
      .map((event) => event.job_id!.slice(5, 6))
    // Both queues are served before either is drained.
    expect(starts.slice(0, 4).filter((queue) => queue === 'b').length).toBe(2)
  }, 40_000)

  it('passes the handler exactly the requested data and completes the job (B1-AC08)', async () => {
    const data = {
      id: 'data-exact',
      action: 'ok',
      ms: 0,
      group: 'g',
      nested: { list: [1, 'two', null], flag: true },
    }
    await scenario.send('wt-plain', data)
    const job = await waitFor(
      async () => {
        const row = await scenario.job('data-exact')
        return row?.state === 'completed' && row
      },
      15_000,
      'the job to complete',
    )
    expect(job.retry_count).toBe(0)
    const [start] = (await scenario.events('data-exact')).filter(
      (event) => event.kind === 'start',
    )
    expect(start!.data).toEqual(data)
  }, 20_000)

  it('fails a throwing attempt with its message, retries it, then calls the failure handler once (B1-AC08, B1-AC11)', async () => {
    await scenario.send('wt-plain', { id: 'throws', action: 'throw' })
    const failed = await waitFor(
      async () => {
        const row = await scenario.job('throws')
        return row?.state === 'failed' && row
      },
      20_000,
      'the job to fail finally',
    )
    expect(failed.retry_count).toBe(1)
    expect(failed.output).toMatchObject({
      reason: 'error',
      message: 'boom throws',
    })
    await waitFor(
      async () =>
        (await scenario.events('throws')).some(
          (event) => event.kind === 'failure',
        ),
      20_000,
      'the failure handler',
    )
    const kinds = (await scenario.events('throws')).map((event) => event.kind)
    // Two attempts, and the failure handler only after the last one.
    expect(kinds).toEqual(['start', 'start', 'failure'])
    const [failure] = (await scenario.events('throws')).filter(
      (event) => event.kind === 'failure',
    )
    expect(failure!.data).toEqual({ id: 'throws', action: 'throw' })
    expect((await scenario.failureCopy('throws'))?.state).toBe('completed')
  }, 45_000)

  it('calls a failure handler that throws once again, and its second call takes effect (B1-AC11)', async () => {
    await scenario.send('wt-single', {
      id: 'failure-retried',
      action: 'throw',
      failureThrowsOnce: true,
    })
    await waitFor(
      async () =>
        (await scenario.events('failure-retried')).some(
          (event) => event.kind === 'failure',
        ),
      30_000,
      'the second failure handler call',
    )
    expect(
      (await scenario.events('failure-retried')).map((event) => event.kind),
    ).toEqual(['start', 'failure-error', 'failure'])
    const copy = await scenario.failureCopy('failure-retried')
    expect(copy).toMatchObject({ state: 'completed', retry_count: 1 })
  }, 40_000)

  // ASSUMPTION(oferty-pracy-2ba.1/ASM-4): a pool process that exits by
  // itself fails the attempt with the reason `exited` and is replaced.
  it('fails the attempt of a process that exits by itself, calls the failure handler after the last attempt and replaces the process (B1-AC11)', async () => {
    await scenario.send('wt-single', { id: 'exits', action: 'exit' })
    const job = await waitFor(
      async () => {
        const row = await scenario.job('exits')
        return row?.state === 'failed' && row
      },
      15_000,
      'the job to fail',
    )
    expect(job.output).toMatchObject({ reason: 'exited' })
    expect(job.output?.message).toContain('code 3')
    await waitFor(
      async () =>
        (await scenario.events('exits')).some(
          (event) => event.kind === 'failure',
        ),
      15_000,
      'the failure handler',
    )
    for (const id of ['after-exit-1', 'after-exit-2'])
      await scenario.send('wt-plain', { id, action: 'ok', ms: 500 })
    for (const id of ['after-exit-1', 'after-exit-2'])
      await waitFor(
        async () => (await scenario.job(id))?.state === 'completed',
        15_000,
        `${id} to complete`,
      )
  }, 40_000)

  it('takes a job of an existing queue without a registered handler from the list of queues it read at start, cancels it without retry and logs its name (B1-AC12)', async () => {
    await scenario.send('wt-orphan', { id: 'orphan', action: 'ok' })
    await scenario.send('ai-execution', { id: 'existing-path', action: 'ok' })
    const job = await waitFor(
      async () => {
        const row = await scenario.job('orphan')
        return row?.state === 'cancelled' && row
      },
      15_000,
      'the job to be cancelled',
    )
    expect(job.retry_count).toBe(0)
    expect(worker.output()).toContain(
      'No handler is registered for job "wt-orphan"',
    )
    expect(await scenario.events('orphan')).toEqual([])
    expect(await scenario.failureCopy('orphan')).toBeUndefined()
    // The existing path's queue is left to the existing path (B1-R17).
    expect((await scenario.job('existing-path'))?.state).toBe('created')
  }, 20_000)

  it('renews the liveness record every 10 s, and the container health check fails when it is older than 30 s (B1-AC14)', async () => {
    const seen = async () =>
      +(
        await scenario.pool.query(
          "SELECT last_seen FROM service_heartbeats WHERE service = 'worker'",
        )
      ).rows[0].last_seen
    const first = await seen()
    const renewed = await waitFor(
      async () => {
        const next = await seen()
        return next > first && next
      },
      12_000,
      'the liveness record to be renewed',
    )
    expect(renewed - first).toBeGreaterThan(8_000)
    expect(renewed - first).toBeLessThan(12_000)
    const health = (env: Record<string, string>) =>
      run(process.execPath, ['--import', 'tsx', 'scripts/worker-health.ts'], {
        env: { ...process.env, DATABASE_URL: scenario.url, ...env },
      }).then(
        () => 0,
        (error: { code: number }) => error.code,
      )
    expect(await health({})).toBe(0)
    // A stale record, as left by a hung worker loop.
    await scenario.sql(
      `UPDATE ${scenario.schema}.service_heartbeats SET last_seen = now() - interval '31 seconds'`,
    )
    expect(await health({})).toBe(1)
  }, 30_000)
})

integration('worker library: ending a process (B1-AC09, B1-AC11)', () => {
  let scenario: Scenario
  let worker: TestWorker

  beforeAll(async () => {
    scenario = await createScenario('wk_end')
    worker = scenario.startWorker({
      WORKER_POOL_SIZE: '4',
      TEST_NEVER_CONFIRM: '1',
    })
    await waitForReady(worker)
  }, 60_000)

  afterAll(async () => {
    await scenario?.drop()
  }, 30_000)

  it('ends the process and fails the attempt with its reason in each of four cases', async () => {
    const started = Date.now()
    await scenario.send('wt-plain', {
      id: 'silent',
      action: 'busy',
      ms: 60_000,
    })
    await scenario.send('wt-limited', {
      id: 'limited',
      action: 'ok',
      ms: 60_000,
    })
    await scenario.send('wt-single', { id: 'taken', action: 'ok', ms: 60_000 })
    await scenario.send('wt-single', {
      id: 'unconfirmed',
      action: 'ok',
      ms: 60_000,
    })
    const startOf = async (id: string) =>
      waitFor(
        async () =>
          (await scenario.events(id)).find((event) => event.kind === 'start'),
        10_000,
        `${id} to start`,
      )
    const [silent, limited, taken, unconfirmed] = await Promise.all(
      ['silent', 'limited', 'taken', 'unconfirmed'].map(startOf),
    )
    // Another attempt takes the job over, as after a lost heartbeat.
    // ASSUMPTION(oferty-pracy-2ba.1/ASM-3): its reason is in the log.
    await scenario.sql(
      `UPDATE ${scenario.queueSchema}.job SET retry_count = retry_count + 1 WHERE data->>'id' = 'taken' AND name = 'wt-single'`,
    )

    const reasonOf = (id: string, reason: string, timeoutMs: number) =>
      waitFor(
        async () => {
          const row = await scenario.job(id)
          return row?.output?.reason === reason && row
        },
        timeoutMs,
        `${id} to fail with ${reason}`,
      )
    const limitedJob = await reasonOf('limited', 'time-limit', 10_000)
    expect(limitedJob.output?.message).toContain('time limit of 3 s')
    expect(alive(limited!.pid)).toBe(false)

    await waitFor(
      async () => !alive(taken!.pid),
      15_000,
      'the taken-over process to end',
    )
    expect(worker.output()).toMatch(/job "wt-single" \S+ failed \(taken-over\)/)

    const silentJob = await reasonOf('silent', 'silent', 20_000)
    expect(Date.now() - started).toBeGreaterThan(15_000)
    expect(silentJob.output?.message).toContain('did not report for 15 s')
    expect(alive(silent!.pid)).toBe(false)

    const unconfirmedJob = await reasonOf('unconfirmed', 'unconfirmed', 30_000)
    expect(Date.now() - started).toBeGreaterThan(25_000)
    expect(unconfirmedJob.output?.message).toContain('for 25 s')
    expect(alive(unconfirmed!.pid)).toBe(false)
    // The only attempt failed: its failure handler runs.
    await waitFor(
      async () =>
        (await scenario.events('unconfirmed')).some(
          (event) => event.kind === 'failure',
        ),
      15_000,
      'the failure handler after an ended process',
    )
  }, 90_000)

  it('calls the failure handler after the last attempt of a time-limited job ends (B1-AC11)', async () => {
    await waitFor(
      async () => {
        const row = await scenario.job('limited')
        return row?.state === 'failed' && row
      },
      20_000,
      'the time-limited job to fail finally',
    )
    await waitFor(
      async () =>
        (await scenario.events('limited')).some(
          (event) => event.kind === 'failure',
        ),
      15_000,
      'the failure handler',
    )
    expect(
      (await scenario.events('limited')).filter((e) => e.kind === 'start'),
    ).toHaveLength(2)
  }, 40_000)
})

integration('worker library: a killed worker (B1-AC10, B1-AC11)', () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario('wk_lost')
  }, 60_000)

  afterAll(async () => {
    await scenario?.drop()
  }, 30_000)

  it('retries the job of a killed worker within 90 s and calls the failure handler after a killed last attempt', async () => {
    const first = scenario.startWorker()
    await waitForReady(first)
    // Both queues' time limits are far longer than the 90 s.
    await scenario.send('wt-plain', {
      id: 'lost',
      action: 'resume',
      ms: 600_000,
    })
    await scenario.send('wt-single', {
      id: 'lost-last',
      action: 'ok',
      ms: 600_000,
    })
    const starts = await waitFor(
      async () => {
        const events = (await scenario.events()).filter(
          (event) => event.kind === 'start',
        )
        return events.length === 2 && events
      },
      15_000,
      'both jobs to start',
    )
    first.child.kill('SIGKILL')
    const killed = Date.now()
    await first.exited
    // The pool processes end with their worker.
    await waitFor(
      async () => starts.every((event) => !alive(event.pid)),
      5_000,
      'the pool processes to end',
    )
    const second = scenario.startWorker()
    await waitForReady(second)
    // Only the system's own processes supervise: the second worker's queue
    // client fails the attempts whose heartbeat stopped.
    try {
      await waitFor(
        async () => {
          const row = await scenario.job('lost')
          return row?.state === 'completed' && row
        },
        90_000 - (Date.now() - killed),
        'the lost job to be retried and completed',
      )
      expect(Date.now() - killed).toBeLessThan(90_000)
      // No later than the job heartbeat (30 s) plus the supervision passes.
      const events = await scenario.events('lost')
      expect(events.map((event) => event.kind)).toEqual([
        'start',
        'start',
        'end',
      ])
      expect(events[1]!.pid).not.toBe(events[0]!.pid)
      const failure = await waitFor(
        async () =>
          (await scenario.events('lost-last')).find(
            (event) => event.kind === 'failure',
          ),
        30_000,
        'the failure handler of the killed last attempt',
      )
      expect(failure.data).toEqual({
        id: 'lost-last',
        action: 'ok',
        ms: 600_000,
      })
    } finally {
      second.child.kill('SIGKILL')
    }
  }, 150_000)
})

integration('worker library: stopping (B1-AC13)', () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario('wk_stop')
  }, 60_000)

  afterAll(async () => {
    await scenario?.drop()
  }, 30_000)

  it('completes a job that ends within 30 s, ends and retries a longer one, and takes nothing new', async () => {
    const worker = scenario.startWorker()
    await waitForReady(worker)
    await scenario.send('wt-plain', { id: 'short', action: 'ok', ms: 5_000 })
    await scenario.send('wt-plain', { id: 'long', action: 'ok', ms: 120_000 })
    const long = await waitFor(
      async () => {
        const events = (await scenario.events()).filter(
          (event) => event.kind === 'start',
        )
        return events.length === 2 && events.find((e) => e.job_id === 'long')
      },
      15_000,
      'both jobs to start',
    )
    const signalled = Date.now()
    worker.child.kill('SIGTERM')
    await scenario.send('wt-second', { id: 'after', action: 'ok' })
    expect(await worker.exited).toBe(0)
    const stopped = Date.now() - signalled
    expect(stopped).toBeGreaterThan(29_000)
    expect(stopped).toBeLessThan(40_000)
    expect((await scenario.job('short'))?.state).toBe('completed')
    expect(await scenario.job('long')).toMatchObject({
      state: 'retry',
      output: { reason: 'shutdown' },
    })
    expect(alive(long.pid)).toBe(false)
    expect((await scenario.job('after'))?.state).toBe('created')
    expect(await scenario.events('after')).toEqual([])
  }, 60_000)
})

integration(
  'worker library: a job taken as the stop signal arrives (B1-AC13)',
  () => {
    let scenario: Scenario

    beforeAll(async () => {
      scenario = await createScenario('wk_race')
    }, 60_000)

    afterAll(async () => {
      await scenario?.drop()
    }, 30_000)

    it('carries out a job the queue handed over after the signal, instead of failing it', async () => {
      // The job source holds each taken job for 3 s before handing it over.
      const worker = scenario.startWorker({ TEST_DELAY_NEXT_MS: '3000' })
      await waitForReady(worker)
      await scenario.send('wt-single', { id: 'raced', action: 'ok', ms: 500 })
      await waitFor(
        async () => (await scenario.job('raced'))?.state === 'active',
        10_000,
        'the job to be taken',
      )
      worker.child.kill('SIGTERM')
      expect(await worker.exited).toBe(0)
      expect(await scenario.job('raced')).toMatchObject({
        state: 'completed',
        retry_count: 0,
      })
      expect(
        (await scenario.events('raced')).map((event) => event.kind),
      ).toEqual(['start', 'end'])
      expect(await scenario.failureCopy('raced')).toBeUndefined()
    }, 30_000)
  },
)

integration('worker library: exclusivity with two workers (B1-AC05)', () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario('wk_excl')
  }, 60_000)

  afterAll(async () => {
    await scenario?.drop()
  }, 30_000)

  it('never carries out two jobs with the same key value at once, while different values run together', async () => {
    const workers = [scenario.startWorker(), scenario.startWorker()]
    await Promise.all(workers.map((worker) => waitForReady(worker)))
    const jobs = [
      { id: 'x1', group: 'x' },
      { id: 'x2', group: 'x' },
      { id: 'x3', group: 'x' },
      { id: 'y1', group: 'y' },
      { id: 'y2', group: 'y' },
    ]
    for (const job of jobs)
      await scenario.send(
        'wt-exclusive',
        { ...job, action: 'ok', ms: 2_000 },
        // The key value the definition takes from the field `group`.
        job.group,
      )
    await waitFor(
      async () =>
        (await scenario.events()).filter((event) => event.kind === 'end')
          .length === jobs.length,
      40_000,
      'every job to end',
    )
    const events = await scenario.events()
    const runs = spans(events)
    for (const a of jobs)
      for (const b of jobs)
        if (a.id < b.id && a.group === b.group)
          expect(
            overlap(runs.get(a.id)!, runs.get(b.id)!),
            `${a.id} ${b.id}`,
          ).toBe(false)
    const differentAtOnce = jobs.some((a) =>
      jobs.some(
        (b) => a.group !== b.group && overlap(runs.get(a.id)!, runs.get(b.id)!),
      ),
    )
    expect(differentAtOnce).toBe(true)
  }, 60_000)
})

integration('worker library: fatal errors (B1-AC03, B1-AC14)', () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario('wk_fatal')
  }, 60_000)

  afterAll(async () => {
    await scenario?.drop()
  }, 30_000)

  it('stops renewing the liveness record when the worker loop hangs, so the health check fails (B1-AC14)', async () => {
    const worker = scenario.startWorker({ TEST_HANG_NEXT: '1' })
    await waitForReady(worker)
    const seen = async () =>
      +(
        await scenario.pool.query(
          "SELECT last_seen FROM service_heartbeats WHERE service = 'worker'",
        )
      ).rows[0].last_seen
    const first = await seen()
    await sleep(31_000)
    expect(await seen()).toBe(first)
    const health = await run(
      process.execPath,
      ['--import', 'tsx', 'scripts/worker-health.ts'],
      { env: { ...process.env, DATABASE_URL: scenario.url } },
    ).then(
      () => 0,
      (error: { code: number }) => error.code,
    )
    expect(health).toBe(1)
    worker.child.kill('SIGKILL')
    await worker.exited
  }, 60_000)

  it('ends with a message naming the module when its registration fails, in the worker and in a pool process', async () => {
    for (const where of ['always', 'pool']) {
      const worker = scenario.startWorker({ TEST_BROKEN_PLUGIN: where })
      expect(await worker.exited).toBe(1)
      expect(worker.output()).toContain(
        'Worker failed: Module plugin "broken" failed to register: the test plugin cannot register',
      )
    }
  }, 40_000)

  it('ends with a message when the queue reports an error', async () => {
    const worker = scenario.startWorker()
    await waitForReady(worker)
    await scenario.sql(`DROP SCHEMA ${scenario.queueSchema} CASCADE`)
    expect(await worker.exited).toBe(1)
    expect(worker.output()).toContain(
      'Worker failed: the queue reported an error',
    )
  }, 40_000)

  it('ends the production worker on an invalid configuration before the existing path takes a job (B1-AC03, B1-R17)', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const { spawn } = await import('node:child_process')
    const { once } = await import('node:events')
    const file = join(await mkdtemp(join(tmpdir(), 'queues-')), 'queues.json')
    await writeFile(file, JSON.stringify({ 'some-queue': { attempts: -1 } }))
    // A waiting job of an existing-path queue.
    await scenario.sql(`CREATE SCHEMA IF NOT EXISTS ${scenario.queueSchema}`)
    const { PgBoss } = await import('pg-boss')
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: scenario.queueSchema,
      supervise: false,
      schedule: false,
    })
    boss.on('error', () => {})
    await boss.start()
    await boss.createQueue('ai-execution')
    const id = await boss.send('ai-execution', { executionId: 'e' })
    await boss.stop({ graceful: false })
    let output = ''
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'worker/index.ts'],
      {
        env: {
          ...process.env,
          DATABASE_URL: scenario.url,
          PG_BOSS_SCHEMA: scenario.queueSchema,
          QUEUE_CONFIGURATION: file,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const [code] = await once(child, 'exit')
    expect(code).toBe(1)
    expect(output).toContain('Worker failed: Queue configuration')
    expect(output).toContain('queue "some-queue", field "attempts"')
    const { rows } = await scenario.sql(
      `SELECT state FROM ${scenario.queueSchema}.job WHERE id = $1`,
      [id],
    )
    expect(rows).toEqual([{ state: 'created' }])
  }, 60_000)

  it('ends naming the queue and the field when the queue configuration is invalid (B1-AC03)', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'queues-'))
    const file = join(dir, 'queues.json')
    await writeFile(file, JSON.stringify({ 'wt-plain': { attempts: -1 } }))
    const worker = scenario.startWorker({ QUEUE_CONFIGURATION: file })
    expect(await worker.exited).toBe(1)
    expect(worker.output()).toContain('queue "wt-plain", field "attempts"')
  }, 30_000)
})
