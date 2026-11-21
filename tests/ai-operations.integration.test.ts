import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool, transaction } from '../lib/db.ts'
import {
  applyQueueConfiguration,
  createQueue,
  stopQueues,
} from '../lib/queues/index.ts'
import { placeAssignment } from '../modules/ai/index.ts'
import {
  localTestJob,
  operationCallsTable,
  paidTestJob,
  registerTestExecutors,
} from './fixtures/ai/operation-executors.ts'
import { waitFor } from './worker.fixtures.ts'

// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock('../modules/ai/assignments/assignment-settings.ts', () => ({
  assignmentSettings: {
    paid: {
      executor: 'test-paid',
      parameters: { model: 'test' },
      requestingModule: 'Tests',
    },
    local: {
      executor: 'test-local',
      parameters: { model: 'test' },
      requestingModule: 'Tests',
    },
  },
}))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const workerEntry = fileURLToPath(
  new URL('./fixtures/ai/operation-worker.ts', import.meta.url),
)

// T3-R01 of epic sq2: assignments placed in the application and carried out
// by the worker started as in production, pool size 2, with the handler of
// operations on the queues of a paid and a local test executor.
integration('operations of assignments through the worker', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16),
    schema = `aiops_${suffix}`,
    queueSchema = `aiops_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool, url: string
  let worker: ChildProcess | undefined

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    url = connection.toString()
    pool = new Pool({ connectionString: url, max: 4 })
    const sql: string[] = []
    for (const migration of [
      '1770000000004_profiles',
      '1770000000027_ai_assignments',
      '1770000000030_ai_operation_exchange',
      '1770000000031_ai_budget_default_limit',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
    await pool.query(sql.join('\n'))
    await pool.query(operationCallsTable)
    await pool.query(`CREATE TABLE service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    )`)
    setPool(pool)
    process.env.PG_BOSS_SCHEMA = queueSchema
    for (const job of [paidTestJob, localTestJob])
      await createQueue(job.queue, 'exclusivity')
    await applyQueueConfiguration({
      [paidTestJob.queue]: { attempts: 1, timeLimitSeconds: 60 },
      [localTestJob.queue]: { attempts: 1, timeLimitSeconds: 60 },
    })
    registerTestExecutors()
  }, 60_000)

  afterAll(async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      worker.kill('SIGKILL')
      await once(worker, 'exit')
    }
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

  async function startWorker() {
    let output = ''
    const child = spawn(process.execPath, ['--import', 'tsx', workerEntry], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        PG_BOSS_SCHEMA: queueSchema,
        WORKER_POOL_SIZE: '2',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
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

  /** Places an assignment whose executor takes `delayMs` to answer. */
  async function place(settingsName: 'paid' | 'local', delayMs: number) {
    const tag = randomUUID()
    const { assignmentId } = await transaction(() =>
      placeAssignment({
        settingsName,
        type: 'single',
        label: tag,
        instruction: 'Summarise the text.',
        input: JSON.stringify({ tag, delayMs }),
        responseFormat: { name: 'summary', schema: { type: 'object' } },
      }),
    )
    return { assignmentId, tag }
  }

  type Call = { tag: string; started_at: Date; ended_at: Date }
  const overlap = (a: Call, b: Call) =>
    a.started_at < b.ended_at && b.started_at < a.ended_at

  it('carries two assignments of the paid executor out one after the other in the order placed, and one of the local executor at the same time (T3-AC01, T3-R01)', async () => {
    const first = await place('paid', 1500)
    const second = await place('paid', 1500)
    const local = await place('local', 1500)
    worker = await startWorker()
    const ended = await waitFor(
      async () => {
        const { rows } = await pool.query(
          `SELECT a.label AS tag,o.state FROM ai_operations o
           JOIN ai_assignments a ON a.id=o.assignment_id`,
        )
        return (
          rows.length === 3 &&
          rows.every((row: { state: string }) => row.state === 'succeeded') &&
          rows
        )
      },
      60_000,
      'every operation to succeed',
    )
    expect(ended).toHaveLength(3)
    const calls = new Map<string, Call>(
      (
        await pool.query<Call>(
          'SELECT tag,started_at,ended_at FROM operation_calls',
        )
      ).rows.map((call) => [call.tag, call]),
    )
    const [p1, p2, l] = [first, second, local].map((placed) =>
      calls.get(placed.tag)!,
    )
    expect(calls.size).toBe(3)
    expect(overlap(p1!, p2!)).toBe(false)
    expect(p1!.ended_at <= p2!.started_at).toBe(true)
    expect(overlap(p1!, l!) || overlap(p2!, l!)).toBe(true)
  }, 120_000)
})
