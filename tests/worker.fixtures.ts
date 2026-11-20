import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import { runner } from 'node-pg-migrate'
import {
  applyQueueConfiguration,
  readQueueConfiguration,
} from '../lib/queues/index.ts'

export const testConfiguration = fileURLToPath(
  new URL('./fixtures/worker/queues.json', import.meta.url),
)
const entry = fileURLToPath(
  new URL('./fixtures/worker/entry.ts', import.meta.url),
)

/** The test queue migrations, run by the migration tool as in production. */
export const testQueueMigrations = fileURLToPath(
  new URL('./fixtures/worker/queue-migrations', import.meta.url),
)

/**
 * Runs the test queue migrations with the migration tool, recording them in
 * `migrationsSchema`, then applies the test configuration as the migration
 * step does; in the queue schema `PG_BOSS_SCHEMA` names.
 */
export async function prepareTestQueues(
  migrationsSchema: string,
  configuration = testConfiguration,
) {
  await runner({
    databaseUrl: process.env.DATABASE_URL!,
    dir: testQueueMigrations,
    direction: 'up',
    migrationsTable: 'queue_migrations',
    migrationsSchema,
    count: Infinity,
    log: () => {},
  })
  await applyQueueConfiguration(readQueueConfiguration(configuration))
}

export type WorkerEvent = {
  job_id: string | null
  kind: string
  pid: number
  at: Date
  data: Record<string, unknown> | null
}

export type JobRow = {
  id: string
  name: string
  state: string
  retry_count: number
  output: { reason?: string; message?: string } | null
  data: Record<string, unknown>
}

/** A worker process of the test entry, with its output. */
export type TestWorker = {
  child: ChildProcess
  output: () => string
  exited: Promise<number | null>
}

/**
 * An isolated application schema (liveness record and test events) and an
 * isolated queue schema prepared from the test definitions and configuration.
 */
export async function createScenario(prefix: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `${prefix}_${suffix}`
  const queueSchema = `${prefix}_q_${suffix}`
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  await admin.query(`CREATE SCHEMA ${schema}`)
  await admin.query(`
    CREATE TABLE ${schema}.service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE ${schema}.worker_events (
      job_id text,
      kind text NOT NULL,
      pid int NOT NULL,
      at timestamptz NOT NULL DEFAULT clock_timestamp(),
      data jsonb
    );`)
  const url = new URL(process.env.DATABASE_URL!)
  url.searchParams.set('options', `-c search_path=${schema}`)
  const pool = new Pool({ connectionString: url.toString(), max: 3 })
  const previous = process.env.PG_BOSS_SCHEMA
  process.env.PG_BOSS_SCHEMA = queueSchema
  try {
    await prepareTestQueues(schema)
  } finally {
    if (previous === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previous
  }
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: queueSchema,
    supervise: false,
    schedule: false,
  })
  boss.on('error', () => {})
  await boss.start()
  const workers: TestWorker[] = []

  return {
    schema,
    queueSchema,
    url: url.toString(),
    pool,
    boss,

    /** Sends a test job on a queue, outside any transaction. */
    async send(queue: string, data: object, singletonKey?: string) {
      const id = await boss.send(
        queue,
        data,
        singletonKey ? { singletonKey } : {},
      )
      if (!id) throw new Error(`Job not created on ${queue}`)
      return id
    },

    async events(jobId?: string): Promise<WorkerEvent[]> {
      const { rows } = await pool.query(
        `SELECT * FROM worker_events ${jobId ? 'WHERE job_id = $1' : ''} ORDER BY at`,
        jobId ? [jobId] : [],
      )
      return rows
    },

    async job(dataId: string): Promise<JobRow | undefined> {
      const { rows } = await admin.query(
        `SELECT id, name, state, retry_count, output, data FROM ${queueSchema}.job
         WHERE data->>'id' = $1 AND name NOT LIKE '%.failed'`,
        [dataId],
      )
      return rows[0]
    },

    async failureCopy(dataId: string): Promise<JobRow | undefined> {
      const { rows } = await admin.query(
        `SELECT id, name, state, retry_count, output, data FROM ${queueSchema}.job
         WHERE data->>'id' = $1 AND name LIKE '%.failed'`,
        [dataId],
      )
      return rows[0]
    },

    async sql(text: string, values: unknown[] = []) {
      return admin.query(text, values)
    },

    /** Starts a worker process of the test entry on this scenario. */
    startWorker(env: Record<string, string | undefined> = {}): TestWorker {
      let output = ''
      const child = spawn(process.execPath, ['--import', 'tsx', entry], {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          PG_BOSS_SCHEMA: queueSchema,
          QUEUE_CONFIGURATION: testConfiguration,
          WORKER_POOL_SIZE: undefined,
          ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout!.on('data', (chunk) => (output += chunk))
      child.stderr!.on('data', (chunk) => (output += chunk))
      const exited = once(child, 'exit').then(([code]) => code as number | null)
      const worker = { child, output: () => output, exited }
      workers.push(worker)
      return worker
    },

    async drop() {
      for (const worker of workers)
        if (
          worker.child.exitCode === null &&
          worker.child.signalCode === null
        ) {
          worker.child.kill('SIGKILL')
          await worker.exited
        }
      await boss.stop({ graceful: false })
      await pool.end()
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    },
  }
}

export type Scenario = Awaited<ReturnType<typeof createScenario>>

/** Waits until `check` returns a value other than undefined or false. */
export async function waitFor<T>(
  check: () => Promise<T | undefined | false>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value !== undefined && value !== false) return value
    await sleep(250)
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`)
}

/** Waits for the worker's "ready" line. */
export function waitForReady(worker: TestWorker, timeoutMs = 20_000) {
  return waitFor(
    async () => {
      if (worker.child.exitCode !== null)
        throw new Error(`Worker exited: ${worker.output()}`)
      return worker.output().includes('Worker ready')
    },
    timeoutMs,
    'the worker to be ready',
  )
}

/**
 * Whether a process with this id still runs. An ended process whose parent
 * died may stay a zombie until it is reaped; it no longer runs.
 */
export function alive(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return (
      stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z'
    )
  } catch {
    return false
  }
}
