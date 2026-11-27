import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkKeyModes } from '../lib/queues/index.ts'
import { HandlerRegistry } from '../lib/workers/index.ts'
import { runModulePlugins } from '../plugins/index.ts'
import { cvTextReadingJob } from '../modules/profile/index.ts'
import { syncJob } from '../modules/sources/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { ollamaOperationJob } from '../modules/ai/infrastructure/adapters/ollama/ollama.ts'
import { openAiOperationJob } from '../modules/ai/infrastructure/adapters/openai/openai.ts'

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

  it('creates the queue of carrying out a sync run with its failure queue, exclusivity and the configured 3 attempts of an hour, and removes the queue of the former path (B5-AC08, B5-D02, B5-D03)', async () => {
    expect(syncJob.queue).toBe('source-sync-run')
    expect(await boss.getQueue(syncJob.queue)).toMatchObject({
      policy: 'singleton',
      retryLimit: 2,
      expireInSeconds: 3600,
      deadLetter: `${syncJob.queue}.failed`,
    })
    expect(await boss.getQueue(`${syncJob.queue}.failed`)).toBeTruthy()
    expect(await boss.getQueue('source-sync')).toBeFalsy()
  })

  it('removes the paid and the local AI queue of the old way with their failure queues, and the queue of the path before them (sq2 T10)', async () => {
    for (const queue of ['ai-execution-paid', 'ai-execution-local']) {
      expect(await boss.getQueue(queue)).toBeFalsy()
      expect(await boss.getQueue(`${queue}.failed`)).toBeFalsy()
    }
    expect(await boss.getQueue('ai-execution')).toBeFalsy()
    expect(await boss.getQueue('system-smoke')).toBeFalsy()
  })

  it('creates the queues of the paid and the local executor of assignments, with their failure queues, exclusivity on a constant key and the configured 4 attempts of 60 minutes (sq2 T1, ZA-D01)', async () => {
    expect([openAiOperationJob.queue, ollamaOperationJob.queue]).toEqual([
      'ai-operation-openai',
      'ai-operation-ollama',
    ])
    for (const job of [openAiOperationJob, ollamaOperationJob]) {
      expect(job.key).toEqual({ mode: 'exclusivity', value: job.queue })
      expect(await boss.getQueue(job.queue)).toMatchObject({
        policy: 'singleton',
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 3600,
        deadLetter: `${job.queue}.failed`,
      })
      expect(await boss.getQueue(`${job.queue}.failed`)).toBeTruthy()
    }
    await checkKeyModes([openAiOperationJob, ollamaOperationJob])
  })
})
