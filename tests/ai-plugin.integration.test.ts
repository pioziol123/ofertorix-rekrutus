import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import { readExecutionHistory } from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import {
  createCompany,
  readCompanyResearch,
  requestResearch,
} from '../modules/companies/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { enqueueMatching } from '../modules/matching/request-assessment.ts'
import {
  importCvText,
  prepareProposal,
  readImport,
} from '../modules/profile/index.ts'
import { emptyProfile } from '../modules/profile/view.ts'
import { prepareAiQueues } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  pricing as researchPricing,
  researchMigrations,
} from './company-research.fixtures.ts'
import { pricing } from './matching-ai.fixtures.ts'
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
    usePricing('matching', pricing)
    usePricing('profile', pricing)
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

  /** An offer and an active profile for Matching to assess. */
  async function offer() {
    const ad = randomUUID(),
      revision = randomUUID(),
      profileVersion = randomUUID(),
      scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'solid',$2,'{}')",
      [scope, randomUUID()],
    )
    await pool.query(
      "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
      [ad, randomUUID(), scope],
    )
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test',$3)",
      [
        revision,
        ad,
        {
          title: 'PHP developer',
          description: 'PHP backend',
          skills: [{ name: 'PHP' }],
          seniority: 'senior',
        },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [ad, revision],
    )
    await pool.query(
      'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,1,$2,$3,1)',
      [profileVersion, emptyProfile(), randomUUID()],
    )
    await pool.query('UPDATE profile_head SET active_version_id=$1', [
      profileVersion,
    ])
    return ad
  }

  it('delivers an assessment, and the ends of a Profile proposal and of company research whose only attempt failed, each to the module that requested it (B6-AC01, B6-AC07)', async () => {
    const assessment = await enqueueMatching(await offer())
    const text = 'PHP professional'
    const cv = await importCvText(text)
    const proposal = await prepareProposal(cv, text, 0)
    if (!('executionId' in proposal)) throw new Error('Expected a request')
    const companyId = (
      await createCompany({
        commandId: randomUUID(),
        name: 'Research company',
        kind: 'brand',
        website: 'https://company.example',
        description: 'Owner supplied',
      })
    ).id
    const research = await requestResearch(companyId, {
      commandId: randomUUID(),
      refresh: false,
    })

    worker = await startWorker()

    // Matching's receiver took the result: the assessment is published.
    await waitFor(
      async () =>
        (await readExecutionHistory(assessment.id)).at(-1)?.state ===
        'completed',
      30_000,
      'the assessment to be delivered',
    )
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM matching_rating_revisions WHERE request_id=$1',
          [assessment.id],
        )
      ).rows[0].n,
    ).toBe(1)

    // The proposal's only attempt passed its time limit; the failure
    // handler ended it and Profile's receiver took that end.
    await waitFor(
      async () => (await readImport(cv))?.status === 'needs_attention',
      60_000,
      'the end of the proposal preparation to reach Profile',
    )
    expect(await readExecutionHistory(cv)).toMatchObject([
      { state: 'uncertain', cause: 'unknown' },
    ])

    // The same for company research, delivered to Companies.
    const operation = async () =>
      (await readCompanyResearch(companyId)).operations.find(
        (o) => o.id === research.id,
      )
    await waitFor(
      async () => (await operation())?.state === 'unknown',
      60_000,
      'the end of the research to reach Companies',
    )
    expect(await readExecutionHistory(research.id)).toMatchObject([
      { state: 'uncertain', cause: 'unknown' },
    ])
    expect(await operation()).toMatchObject({ report: null })
  }, 150_000)
})
