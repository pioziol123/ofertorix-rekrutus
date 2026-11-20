import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, db, setPool, transaction } from '../lib/db.ts'
import {
  defineJob,
  prepareQueues,
  readQueueConfiguration,
  sendJob,
  stopQueues,
  type QueueConfiguration,
} from '../lib/queues/index.ts'
import {
  allDefinitions,
  deduplicatedJob,
  plainJob,
} from './fixtures/worker/definitions.ts'
import { testConfiguration } from './worker.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
const run = promisify(execFile)

integration('queue library on an isolated queue schema', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `queues_${suffix}`
  const queueSchema = `queues_q_${suffix}`
  let admin: Pool
  let boss: PgBoss

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    await admin.query(`CREATE TABLE ${schema}.notes (id text PRIMARY KEY)`)
    setPool(
      new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
      }),
    )
    vi.stubEnv('PG_BOSS_SCHEMA', queueSchema)
    await prepareQueues(
      allDefinitions,
      readQueueConfiguration(testConfiguration),
    )
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
      supervise: false,
      schedule: false,
    })
    boss.on('error', () => {})
    await boss.start()
  }, 30_000)

  afterAll(async () => {
    await stopQueues()
    await boss?.stop({ graceful: false })
    await closePool()
    vi.unstubAllEnvs()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })

  const jobsOf = async (id: string) =>
    (
      await admin.query(
        `SELECT name, state, singleton_key FROM ${queueSchema}.job WHERE data->>'id' = $1`,
        [id],
      )
    ).rows
  const note = (id: string) =>
    db().query('INSERT INTO notes (id) VALUES ($1)', [id])
  const notes = async () =>
    (await admin.query(`SELECT id FROM ${schema}.notes ORDER BY id`)).rows.map(
      (row) => row.id,
    )

  it('keeps a job requested in a rolled-back operation out of the queue and one of a committed operation in it (B1-AC01)', async () => {
    await expect(
      transaction(async () => {
        await note('rolled-back')
        expect(
          await sendJob(plainJob, { id: 'rolled-back', action: 'ok' }),
        ).toBe('created')
        throw new Error('the operation failed')
      }),
    ).rejects.toThrow('the operation failed')
    await transaction(async () => {
      await note('committed')
      await sendJob(plainJob, { id: 'committed', action: 'ok' })
    })
    expect(await jobsOf('rolled-back')).toEqual([])
    expect(await jobsOf('committed')).toEqual([
      { name: 'wt-plain', state: 'created', singleton_key: null },
    ])
    expect(await notes()).toEqual(['committed'])
  })

  it('refuses a request to a queue that does not exist and rolls the operation back (B1-AC04)', async () => {
    const missing = defineJob<{ id: string }>({ queue: 'wt-missing' })
    await expect(
      transaction(async () => {
        await note('refused')
        await sendJob(missing, { id: 'refused' })
      }),
    ).rejects.toThrow(/wt-missing/)
    expect(await notes()).not.toContain('refused')
    expect(await jobsOf('refused')).toEqual([])
  })

  it('creates no second job with the same deduplication key while the first waits or runs, and tells the operation (B1-AC06)', async () => {
    const data = (id: string) => ({ id, action: 'ok' as const, group: 'd' })
    expect(await sendJob(deduplicatedJob, data('dedup-1'))).toBe('created')
    expect(await sendJob(deduplicatedJob, data('dedup-2'))).toBe('duplicate')
    const [taken] = await boss.fetch<{ id: string }>('wt-dedup')
    expect(taken!.data.id).toBe('dedup-1')
    expect(await sendJob(deduplicatedJob, data('dedup-3'))).toBe('duplicate')
    // Another key value is not a duplicate.
    expect(
      await sendJob(deduplicatedJob, { ...data('dedup-other'), group: 'e' }),
    ).toBe('created')
    await boss.complete('wt-dedup', taken!.id)
    expect(await sendJob(deduplicatedJob, data('dedup-4'))).toBe('created')
    expect(await jobsOf('dedup-2')).toEqual([])
    expect(await jobsOf('dedup-3')).toEqual([])
    expect(await jobsOf('dedup-4')).toEqual([
      { name: 'wt-dedup', state: 'created', singleton_key: 'd' },
    ])
  })

  it('creates each queue with its failure queue, its definition key mode and the mechanism defaults or the given settings (B1-AC02)', async () => {
    const queue = async (name: string) => (await boss.getQueue(name))!
    expect(await queue('wt-second')).toMatchObject({
      policy: 'standard',
      retryLimit: 2,
      retryDelay: 0,
      retryBackoff: false,
      expireInSeconds: 900,
      retentionSeconds: 1_209_600,
      deleteAfterSeconds: 604_800,
      heartbeatSeconds: 30,
      deadLetter: 'wt-second.failed',
    })
    expect(await queue('wt-limited')).toMatchObject({
      retryLimit: 1,
      expireInSeconds: 3,
      deadLetter: 'wt-limited.failed',
    })
    expect((await queue('wt-exclusive')).policy).toBe('singleton')
    expect((await queue('wt-dedup')).policy).toBe('exclusive')
    for (const definition of allDefinitions)
      expect(await queue(`${definition.queue}.failed`)).toMatchObject({
        policy: 'standard',
        heartbeatSeconds: 30,
      })
  })

  it('changes a queue when a changeable setting changes, and returns it to the default when the setting is removed (B1-AC02)', async () => {
    const changed: QueueConfiguration = {
      'wt-second': {
        attempts: 5,
        retryDelaySeconds: 7,
        retryBackoff: true,
        timeLimitSeconds: 60,
        waitingRetentionSeconds: 100,
        finishedRetentionSeconds: 0,
      },
    }
    await prepareQueues(allDefinitions, changed)
    expect(await boss.getQueue('wt-second')).toMatchObject({
      retryLimit: 4,
      retryDelay: 7,
      retryBackoff: true,
      expireInSeconds: 60,
      retentionSeconds: 100,
      deleteAfterSeconds: 0,
      deadLetter: 'wt-second.failed',
    })
    await prepareQueues(allDefinitions, {})
    expect(await boss.getQueue('wt-second')).toMatchObject({
      retryLimit: 2,
      retryDelay: 0,
      retryBackoff: false,
      expireInSeconds: 900,
    })
    await prepareQueues(
      allDefinitions,
      readQueueConfiguration(testConfiguration),
    )
  }, 30_000)

  it('stops with an error naming the queue when a key mode changes or an entry names no definition’s queue (B1-AC02)', async () => {
    const changedMode = allDefinitions.map((definition) =>
      definition.queue === 'wt-plain'
        ? defineJob({
            queue: 'wt-plain',
            key: { mode: 'exclusivity', value: 'one' },
          })
        : definition,
    )
    await expect(prepareQueues(changedMode, {})).rejects.toThrow(
      /Queue "wt-plain" exists with policy "standard".*key mode "exclusivity"/,
    )
    await expect(
      prepareQueues(allDefinitions, { 'wt-unknown': { attempts: 1 } }),
    ).rejects.toThrow(/queue "wt-unknown", which no job definition has/)
    expect((await boss.getQueue('wt-plain'))!.policy).toBe('standard')
  }, 30_000)

  it('stops the migration step on an invalid configuration, naming the queue and the field (B1-AC03)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'queues-'))
    const file = join(dir, 'queues.json')
    await writeFile(file, JSON.stringify({ 'some-queue': { retries: 2 } }))
    const result = await run(
      process.execPath,
      ['--import', 'tsx', 'scripts/init-queue.ts'],
      {
        env: {
          ...process.env,
          PG_BOSS_SCHEMA: queueSchema,
          QUEUE_CONFIGURATION: file,
        },
      },
    ).then(
      () => ({ code: 0, stderr: '' }),
      (error: { code: number; stderr: string }) => error,
    )
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('queue "some-queue", field "retries"')
  }, 30_000)
})
