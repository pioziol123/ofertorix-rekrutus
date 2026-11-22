import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, db, setPool, transaction } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import {
  checkExecution,
  readExecutionHistory,
  requestExecution,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import {
  createCompany,
  readCompanyResearch,
  researchSettingsKey,
} from '../modules/companies/index.ts'
import { prepareAiQueues } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  pricing as researchPricing,
  researchMigrations,
} from './company-research.fixtures.ts'
import { waitFor } from './worker.fixtures.ts'

// The settings and price lists AI keeps in code, replaced for the requests
// made here; an execution carries its settings to the worker.
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

const workerEntry = fileURLToPath(
  new URL('./fixtures/ai/production-worker.ts', import.meta.url),
)

// B6 Verification: the worker runs the repository's plugins index, so the
// AI module plugin's own receivers, job handler and failure handler carry
// the work out; only OpenAI is simulated. The AI queues take 1 attempt of
// 3 s, so that work the simulated OpenAI never answers fails finally within
// the test.
integration('AI work carried out by the AI module plugin', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16),
    schema = `aiplugin_${suffix}`,
    queueSchema = `aiplugin_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool, url: string, worker: ChildProcess | undefined

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    url = connection.toString()
    pool = new Pool({ connectionString: url, max: 5 })
    const sql: string[] = []
    for (const migration of [
      ...researchMigrations,
      '1770000000019_research_ai_executions',
      '1770000000020_ai_execution_lease',
      '1770000000026_ai_without_local_slot_and_lease',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (s: string) => sql.push(s),
      })
    await pool.query(sql.join('\n'))
    await pool.query(
      'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,100)',
      [budgetMonth(new Date())],
    )
    setPool(pool)
    await prepareAiQueues(queueSchema, { attempts: 1, timeLimitSeconds: 3 })
    process.env.PG_BOSS_SCHEMA = queueSchema
    vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
    usePricing('research', researchPricing, 'agent')
  }, 60_000)

  afterAll(async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      worker.kill('SIGKILL')
      await once(worker, 'exit')
    }
    vi.unstubAllEnvs()
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
        OPENAI_API_KEY: 'never-send-test-key',
        WORKER_POOL_SIZE: undefined,
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

  /**
   * Research of the old way, as Companies requested it before it moved to
   * assignments (epic sq2, T9): its row and its agent work, requested
   * through the old contract in one transaction. No module requests the
   * old way any more; its plugin still carries out work requested before.
   */
  async function oldWayResearch(companyId: string) {
    const researchId = randomUUID()
    const check = await checkExecution(researchSettingsKey, 'agent')
    await transaction(async () => {
      await db().query(
        "INSERT INTO company_research(id,company_id,target,configuration,state) VALUES($1,$2,$3,'{}','requested')",
        [researchId, companyId, { name: 'Research company' }],
      )
      const { executionId } = await requestExecution({
        settingsKey: researchSettingsKey,
        operationId: researchId,
        mode: {
          kind: 'agent',
          tools: ['web_search'],
          resultInstruction: 'Write the report from the evidence.',
        },
        instruction: 'Research the company.',
        responseSchema: {
          name: 'company_research',
          schema: { type: 'object' },
        },
        input: JSON.stringify({ name: 'Research company' }),
        check,
      })
      await db().query(
        'UPDATE company_research SET execution_id=$2 WHERE id=$1',
        [researchId, executionId],
      )
    })
    return researchId
  }

  // The Profile (epic sq2, T7), Matching (T8) and Companies (T9) no longer
  // request AI work the old way; their work is delivered through
  // assignments.
  it('delivers the end of company research of the old way whose only attempt failed to the module that requested it (B6-AC01, B6-AC07)', async () => {
    const companyId = (
      await createCompany({
        commandId: randomUUID(),
        name: 'Research company',
        kind: 'brand',
        website: 'https://company.example',
        description: 'Owner supplied',
      })
    ).id
    const researchId = await oldWayResearch(companyId)

    worker = await startWorker()

    // The research's only attempt passed its time limit; the failure
    // handler ended it and Companies' receiver of the old way took that
    // end.
    const operation = async () =>
      (await readCompanyResearch(companyId)).operations.find(
        (o) => o.id === researchId,
      )
    await waitFor(
      async () => (await operation())?.state === 'unknown',
      60_000,
      'the end of the research to reach Companies',
    )
    expect(await readExecutionHistory(researchId)).toMatchObject([
      { state: 'uncertain', cause: 'unknown' },
    ])
    expect(await operation()).toMatchObject({
      report: null,
      error: expect.any(String),
    })
  }, 150_000)
})
