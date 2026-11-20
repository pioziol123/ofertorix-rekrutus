import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkKeyModes } from '../lib/queues/index.ts'
import { HandlerRegistry } from '../lib/workers/index.ts'
import { existingPathQueues } from '../lib/workers/worker.ts'
import { runModulePlugins } from '../plugins/index.ts'
import { aiExecutionJobOptions, aiExecutionQueue } from '../modules/ai/index.ts'
import { cvTextReadingJob } from '../modules/profile/index.ts'
import { syncQueue, syncQueueOptions } from '../modules/sources/index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/**
 * The database the migration step has prepared (`pnpm migrate` before the
 * tests): the application's own queues, not an isolated test schema.
 */
integration('queues of the migrated database', () => {
  let boss: PgBoss

  beforeAll(async () => {
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: process.env.PG_BOSS_SCHEMA ?? 'pgboss',
      supervise: false,
      schedule: false,
    })
    boss.on('error', () => {})
    await boss.start()
  })

  afterAll(async () => {
    await boss?.stop({ graceful: false })
  })

  it('has the queue of every job definition the module plugins register, with the key mode the definition names (B1-AC16, B1-D15)', async () => {
    const registry = new HandlerRegistry()
    await runModulePlugins(registry)
    await checkKeyModes(registry.definitions())
  })

  it('creates the queue of reading a CV with its failure queue, exclusivity and the configured 2 attempts of 2 minutes, and removes the queue of the former path (B4-AC07, B4-D02)', async () => {
    expect(await boss.getQueue(cvTextReadingJob.queue)).toMatchObject({
      policy: 'singleton',
      retryLimit: 1,
      expireInSeconds: 120,
      deadLetter: `${cvTextReadingJob.queue}.failed`,
    })
    expect(await boss.getQueue(`${cvTextReadingJob.queue}.failed`)).toBeTruthy()
    expect(await boss.getQueue('profile-parse')).toBeFalsy()
  })

  it('creates the queues of the modules not yet moved with the settings the modules send their jobs with, and no system check queue (B1-AC15)', async () => {
    expect(await boss.getQueue(syncQueue)).toMatchObject(syncQueueOptions)
    expect(await boss.getQueue(aiExecutionQueue)).toMatchObject(
      aiExecutionJobOptions,
    )
    expect(await boss.getQueue('system-smoke')).toBeFalsy()
    // The worker library leaves exactly these queues to the existing path.
    expect([...existingPathQueues].sort()).toEqual(
      [syncQueue, aiExecutionQueue].sort(),
    )
  })
})
