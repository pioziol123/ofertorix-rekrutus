import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  readBudget,
  readExecution,
  recoverExecutions,
  registerResultReceiver,
  requestExecution,
  runExecution,
  useAiQueue,
  type ExecutionFailureDelivery,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { openAiProvider } from '../modules/ai/infrastructure/adapters/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  aiLeaseMigration,
  matchingMigrations,
  migrate,
  pricing,
  recordingQueue,
} from './matching-ai.fixtures.ts'

// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/**
 * The migration that adds the lease of running paid AI work (0mq.15), on
 * an execution that was running before it, with no sign of life
 * (A15-AC08, A15-R09).
 */
integration('migration of the lease of running paid AI work', () => {
  const schema = `ai_lease_migration_${randomUUID().replaceAll('-', '')}`
  const settingsKey = 'lease-client'
  let admin: Pool, pool: Pool
  const queue = recordingQueue()
  const provider = vi.fn<typeof fetch>()
  const failures: ExecutionFailureDelivery[] = []

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    await migrate(pool, matchingMigrations)
    setPool(pool)
    useAiQueue(queue.boss)
    vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
    usePricing(settingsKey, pricing)
    registerProviderAdapter(openAiProvider(provider))
    registerResultReceiver(settingsKey, {
      receiveResult: async () => ({ accepted: true }),
      receiveFailure: async (delivery) => {
        failures.push(delivery)
      },
    })
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  it('A15-AC08: ends a paid execution running before the migration as interrupted at the first recovery, keeping its reservation', async () => {
    const admitted = await requestExecution({
      settingsKey,
      operationId: randomUUID(),
      inputVersion: null,
      mode: { kind: 'single' },
      instruction: 'Summarise the text.',
      responseSchema: {
        name: 'summary',
        schema: { type: 'object', properties: { text: { type: 'string' } } },
      },
      input: 'Some text',
    })
    // A worker took it before the deploy and was lost with the old code.
    await pool.query("UPDATE ai_executions SET state='running' WHERE id=$1", [
      admitted.executionId,
    ])
    const reserved = (await readBudget()).reserved
    await migrate(pool, [aiLeaseMigration])
    expect(
      (
        await pool.query(
          'SELECT state,lease_owner,lease_expires_at FROM ai_executions WHERE id=$1',
          [admitted.executionId],
        )
      ).rows,
    ).toEqual([{ state: 'running', lease_owner: null, lease_expires_at: null }])
    queue.reset()
    await recoverExecutions()
    expect(queue.executionJobs()).toEqual([admitted.executionId])
    await runExecution(admitted.executionId)
    expect(provider).not.toHaveBeenCalled()
    expect(failures).toMatchObject([
      {
        executionId: admitted.executionId,
        state: 'uncertain',
        cause: 'interrupted',
      },
    ])
    expect(await readExecution(admitted.executionId)).toMatchObject({
      state: 'uncertain',
      cause: 'interrupted',
      cost: { actual: null },
    })
    expect((await readBudget()).reserved).toBe(reserved)
  })
})
