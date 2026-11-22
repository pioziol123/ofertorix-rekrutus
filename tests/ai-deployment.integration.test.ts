import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { readMonthlyBudgets } from '../modules/ai/index.ts'
import {
  failResearchOfOldWay,
  readCompanyResearch,
  requestResearch,
} from '../modules/companies/index.ts'
import {
  decorateMatching,
  enqueueMatching,
  failAssessmentsOfOldWay,
  readAssessmentExchange,
  readMatching,
} from '../modules/matching/index.ts'
import {
  failPreparationsOfOldWay,
  listImports,
  prepareProposal,
  readImport,
} from '../modules/profile/index.ts'
import { importStatusLabel } from '../modules/profile/view.ts'
import { matchingDetailLabels } from '../modules/matching/view.ts'
import { researchStateLabels } from '../modules/companies/view.ts'
import type { OfferView } from '../modules/offers/index.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import { assignmentPricing } from './company-research.fixtures.ts'
import {
  insertActiveProfile,
  insertAd,
} from './matching-assignments.fixtures.ts'

// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** The database migrations in order, the queue migrations left out. */
const migrations = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((name) => name.endsWith('.cjs'))
  .map((name) => name.slice(0, -'.cjs'.length))
  .sort()
const queueMigrations = new Set([
  '1770000000022_profile_cv_text_queue',
  '1770000000023_source_sync_run_queue',
  '1770000000025_ai_execution_queues',
  '1770000000028_ai_operation_queue_openai',
  '1770000000029_ai_operation_queue_ollama',
  '1770000000037_ai_execution_queues_removed',
])
const before = (last: string) =>
  migrations.filter((name) => name <= last && !queueMigrations.has(name))
const deployment = [
  '1770000000035_ai_budget_carried_amounts',
  '1770000000036_ai_old_way_archive',
]

/** The old tables and their names in the archive (T10-R03). */
const archived = {
  ai_executions: 'archive_ai_executions',
  ai_attempts: 'archive_ai_attempts',
  ai_execution_artifacts: 'archive_ai_execution_artifacts',
  matching_batch_artifacts: 'archive_matching_batch_artifacts',
}

/**
 * The query of the profile page's budget card before the deployment
 * (ASSUMPTION(oferty-pracy-0mq.11/ASM-2)): every month with its limit and
 * the settled and reserved amounts of its earlier records.
 */
const earlierCard = `SELECT b.month,b.limit_pln::numeric(16,6)::text AS "limit",
  coalesce(sum(CASE WHEN a.state='settled' THEN a.actual_pln ELSE 0 END),0)::numeric(16,6)::text AS settled,
  coalesce(sum(CASE WHEN a.state!='settled' THEN a.reserved_pln ELSE 0 END),0)::numeric(16,6)::text AS reserved
 FROM ai_budget_months b LEFT JOIN ai_attempts a ON a.month=b.month GROUP BY b.month ORDER BY b.month DESC`

/**
 * T10 of epic sq2 (task oferty-pracy-sq2.11): the deployment of
 * assignments on a database with earlier records in every state. The
 * database migrations run first, then the module operations of the
 * migration step, as `pnpm migrate` orders them.
 */
integration('the deployment of AI assignments on earlier records', () => {
  const schema = `ai_deployment_${randomUUID().replaceAll('-', '')}`
  const queue = aiQueue()
  let admin: Pool, pool: Pool
  let cardBefore: {
    month: string
    limit: string
    settled: string
    reserved: string
  }[]

  const migrate = async (names: string[]) => {
    const sql: string[] = []
    for (const name of names)
      createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
        sql: (s: string) => sql.push(s),
      })
    for (const statement of sql) await pool.query(statement)
  }
  const count = async (table: string) =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n

  /**
   * An execution of the old way in a public state with its settlement
   * record, as the old way saved them; returns the execution's id.
   */
  async function earlierWork(
    state: string,
    attempt: {
      month: string | null
      state: 'open' | 'settled' | 'unknown'
      reserved: string
      actual?: string | null
    },
    settingsKey = 'matching',
    operationId: string = randomUUID(),
  ) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,state,mode,cause)
       VALUES($1,$2,$3,'{}',$4,$5,'single',$6)`,
      [
        id,
        settingsKey,
        operationId,
        randomUUID(),
        state,
        ['failed', 'uncertain', 'retried'].includes(state) ? 'unknown' : null,
      ],
    )
    await pool.query(
      `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,execution_id)
       VALUES($1,NULL,0,$2,1,$3,'execution',$4,$5,$6,'{}',$1)`,
      [
        id,
        attempt.month,
        randomUUID(),
        attempt.state,
        attempt.reserved,
        attempt.actual ?? null,
      ],
    )
    return id
  }

  // The owner's matters of the old way.
  const imports = {
    queued: randomUUID(),
    waitingBudget: randomUUID(),
    running: randomUUID(),
    prepared: randomUUID(),
  }
  const requests = {
    published: randomUUID(),
    failedBefore: randomUUID(),
    excluded: randomUUID(),
    unfinished: randomUUID(),
  }
  const research = {
    completed: randomUUID(),
    failedBefore: randomUUID(),
    unfinished: randomUUID(),
  }
  const companies = { reported: randomUUID(), researching: randomUUID() }
  let ads: { assessed: string; assessing: string }
  let profileVersion: string
  const report = { identity: 'Firma', claims: [] }
  const assessment = {
    summary: 'Ocena sprzed wdrożenia',
    strengths: [],
    gaps: [],
    criteria: [],
  }
  const failedBeforeMessage =
    'Ocena nie została wykonana. Poprzednie wyniki pozostały bez zmian. [AI: http]'
  const researchFailedBeforeMessage =
    'Usługa researchu zwróciła błąd HTTP. Koszt pozostaje zarezerwowany.'

  async function earlierImport(id: string, status: string) {
    await pool.query(
      `INSERT INTO profile_imports(id,kind,status,source_text,professional_text,sha256,text_revision,proposal)
       VALUES($1,'text',$2,'PHP developer','PHP developer','x',1,$3)`,
      [
        id,
        status,
        status === 'proposal'
          ? { summary: null, skills: [], experience: [] }
          : null,
      ],
    )
    await pool.query(
      "INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,1,'PHP developer')",
      [id],
    )
  }

  async function earlierRequest(
    id: string,
    ad: { ad: string; revision: string },
    outcome: {
      state?: 'requested' | 'excluded'
      result?: unknown
      error?: string
      at: string
    },
  ) {
    const execution =
      outcome.state === 'excluded'
        ? null
        : await earlierWork(
            outcome.result ? 'completed' : outcome.error ? 'failed' : 'retried',
            {
              // Outside the months of the budget checks below.
              month: null,
              state: outcome.result || outcome.error ? 'settled' : 'unknown',
              reserved: '0.020000',
              actual: outcome.result || outcome.error ? '0.010000' : null,
            },
            'matching',
            id,
          )
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,result,calculation,error,created_at,updated_at,execution_id)
       VALUES($1,$2,$3,$4,$5,'{}',$6,$7,$8,$9,$10,$10,$11)`,
      [
        id,
        ad.ad,
        ad.revision,
        profileVersion,
        { checks: [], criteria: [] },
        outcome.state ?? 'requested',
        outcome.result ?? null,
        outcome.result
          ? { rating: 70, completeness: 50, components: [] }
          : null,
        outcome.error ?? null,
        outcome.at,
        execution,
      ],
    )
    return execution
  }

  async function earlierResearch(
    id: string,
    company: string,
    outcome: { report?: unknown; error?: string; at: string },
  ) {
    const ended = outcome.report !== undefined || outcome.error !== undefined
    const execution = await earlierWork(
      outcome.report ? 'completed' : outcome.error ? 'failed' : 'running',
      {
        // Outside the months of the budget checks below.
        month: null,
        state: ended ? 'settled' : 'open',
        reserved: '0.500000',
        actual: ended ? '0.250000' : null,
      },
      'research',
      id,
    )
    await pool.query(
      `INSERT INTO company_research(id,company_id,target,configuration,state,result,error,created_at,finished_at,execution_id)
       VALUES($1,$2,$3,'{}','requested',$4,$5,$6,$7,$8)`,
      [
        id,
        company,
        { name: 'Firma', kind: 'brand', website: null, description: '' },
        outcome.report ?? null,
        outcome.error ?? null,
        outcome.at,
        ended ? outcome.at : null,
        execution,
      ],
    )
  }

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 4,
    })
    setPool(pool)
    await migrate(before('1770000000034_company_research_assignment'))

    // Two months of the budget: October with the default limit, November
    // with a limit the owner set in the database.
    await pool.query(
      "INSERT INTO ai_budget_months(month,limit_pln) VALUES('2026-10',100),('2026-11',80)",
    )
    // Earlier records in each state of T10-AC01.
    await earlierWork('completed', {
      month: '2026-10',
      state: 'settled',
      reserved: '1.000000',
      actual: '0.400000',
    })
    await earlierWork('completed', {
      month: '2026-11',
      state: 'settled',
      reserved: '0.500000',
      actual: '0.200000',
    })
    await earlierWork('uncertain', {
      month: '2026-11',
      state: 'unknown',
      reserved: '0.300000',
    })
    // Waiting for the budget: no month and nothing reserved, as the old way
    // saved it.
    await earlierWork('waiting_budget', {
      month: null,
      state: 'open',
      reserved: '0',
    })
    await earlierWork('queued', {
      month: '2026-11',
      state: 'open',
      reserved: '0.400000',
    })
    await earlierWork('running', {
      month: '2026-11',
      state: 'open',
      reserved: '0.600000',
    })
    // Waiting to be taken: the outcome is saved and its cost known, but the
    // record is not settled until the delivery.
    await earlierWork('delivering', {
      month: '2026-11',
      state: 'open',
      reserved: '0.700000',
      actual: '0.100000',
    })

    // The Profile's preparations.
    await earlierImport(imports.queued, 'ai_queued')
    await earlierImport(imports.waitingBudget, 'waiting_budget')
    await earlierImport(imports.running, 'ai_running')
    await earlierImport(imports.prepared, 'proposal')

    // Matching's assessments: an offer assessed before, with a published
    // assessment, a later assessment that ended without one and an
    // excluded request; an offer whose assessment was still in progress.
    profileVersion = await insertActiveProfile(pool)
    const assessed = await insertAd(pool)
    const assessing = await insertAd(pool)
    ads = { assessed: assessed.ad, assessing: assessing.ad }
    const publishedExecution = await earlierRequest(
      requests.published,
      assessed,
      { result: assessment, at: '2026-11-01T10:00:00Z' },
    )
    await pool.query(
      `INSERT INTO matching_rating_revisions(id,ad_id,request_id,profile_version_id,ad_revision_id,input,result,calculation,weights_version_id,author,assessment_author,reason)
       VALUES($1,$2,$3,$4,$5,'{}',$6,$7,'00000000-0000-4000-8000-000000000009','ai','ai','assessment')`,
      [
        requests.published,
        assessed.ad,
        requests.published,
        profileVersion,
        assessed.revision,
        assessment,
        { rating: 70, completeness: 50, components: [] },
      ],
    )
    await pool.query(
      'INSERT INTO matching_rating_heads(ad_id,revision_id) VALUES($1,$2)',
      [assessed.ad, requests.published],
    )
    await pool.query(
      `INSERT INTO ai_execution_artifacts(id,execution_id,request_id,kind,content,sha256)
       VALUES($1,$2,$3,'request','{}',$4)`,
      [randomUUID(), publishedExecution, requests.published, 'a'.repeat(64)],
    )
    // The archive of a provider batch from before the AI executions.
    await pool.query(
      `INSERT INTO matching_batch_artifacts(operation_id,kind,artifact_key,sha256,content)
       VALUES($1,'input','file_input',$2,'{}')`,
      [requests.published, 'b'.repeat(64)],
    )
    await earlierRequest(requests.failedBefore, assessed, {
      error: failedBeforeMessage,
      at: '2026-11-02T10:00:00Z',
    })
    await earlierRequest(requests.excluded, assessed, {
      state: 'excluded',
      at: '2026-11-03T10:00:00Z',
    })
    await earlierRequest(requests.unfinished, assessing, {
      at: '2026-11-04T10:00:00Z',
    })

    // Companies' research.
    for (const [index, id] of Object.values(companies).entries())
      await pool.query(
        "INSERT INTO companies(id,name,kind,description) VALUES($1,$2,'brand','')",
        [id, `Firma ${index}`],
      )
    await earlierResearch(research.completed, companies.reported, {
      report,
      at: '2026-11-01T10:00:00Z',
    })
    await earlierResearch(research.failedBefore, companies.reported, {
      error: researchFailedBeforeMessage,
      at: '2026-11-02T10:00:00Z',
    })
    await earlierResearch(research.unfinished, companies.researching, {
      at: '2026-11-03T10:00:00Z',
    })

    cardBefore = (await pool.query(earlierCard)).rows

    // The deployment: the database migrations, then the module operations
    // of the migration step.
    await migrate(deployment)
    vi.stubEnv('OPENAI_API_KEY', 'test-key-never-send')
    usePricing(assignmentPricing, ['single', 'agent'])
    await queue.start()
  }, 60000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    await queue.stop()
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  // Before the module operations run: each module still holds its old
  // matters in progress, from its own data alone.
  it('sq2.10 ASM-1, sq2.9 ASM-4: reuses research and an assessment of the old way that had no outcome at the deployment, and places nothing, until the migration step ends them', async () => {
    expect(
      await requestResearch(companies.researching, {
        commandId: randomUUID(),
        refresh: true,
      }),
    ).toEqual({ id: research.unfinished, reused: true })
    expect(await enqueueMatching(ads.assessing)).toMatchObject({
      id: requests.unfinished,
      reused: true,
    })
    expect(await count('ai_assignments')).toBe(0)
  })

  it('sq2.8 ASM-2: refuses a new preparation of a CV the import records as in progress, until the migration step ends it', async () => {
    await expect(
      prepareProposal(imports.running, 'PHP developer', 1),
    ).rejects.toThrow('A proposal is already pending')
  })

  it('T10-AC02: the migration step marks every unfinished matter of the old way as failed, and a second run ends nothing more', async () => {
    expect(await failPreparationsOfOldWay()).toBe(3)
    expect(await failAssessmentsOfOldWay()).toBe(1)
    expect(await failResearchOfOldWay()).toBe(1)
    expect(await failPreparationsOfOldWay()).toBe(0)
    expect(await failAssessmentsOfOldWay()).toBe(0)
    expect(await failResearchOfOldWay()).toBe(0)
  })

  it('T10-AC01: carries each month with its limit, its settled costs and the reserved amounts of the records of unknown cost, started or waiting to be taken; the default limit is 100 PLN', async () => {
    expect(
      (
        await pool.query(
          'SELECT month,limit_pln::text AS "limit",carried_settled::text AS settled,carried_held::text AS held FROM ai_budget_months ORDER BY month',
        )
      ).rows,
    ).toEqual([
      {
        month: '2026-10',
        limit: '100.000000',
        settled: '0.400000',
        held: '0.000000',
      },
      // Settled 0.2; held 0.3 (unknown cost) + 0.6 (started) + 0.7
      // (waiting to be taken); the queued 0.4 and the work waiting for the
      // budget carry nothing.
      {
        month: '2026-11',
        limit: '80.000000',
        settled: '0.200000',
        held: '1.600000',
      },
    ])
    expect(
      (
        await pool.query(
          'SELECT limit_pln::text AS l FROM ai_budget_default_limit',
        )
      ).rows[0].l,
    ).toBe('100.000000')
    expect(await readMonthlyBudgets()).toEqual([
      {
        month: '2026-11',
        limit: '80.000000',
        settled: '0.200000',
        held: '1.600000',
        charge: '1.800000',
      },
      {
        month: '2026-10',
        limit: '100.000000',
        settled: '0.400000',
        held: '0.000000',
        charge: '0.400000',
      },
    ])
  })

  it('T10-AC05: the budget card shows each earlier month with the limit and the settled amount it showed before, and a reserved amount lower by exactly the released reservations', async () => {
    const card = await readMonthlyBudgets()
    expect(card.map((month) => month.month)).toEqual(
      cardBefore.map((month) => month.month),
    )
    // The only reservation released is the 0.4 of the queued work; the work
    // waiting for the budget reserved nothing.
    const released: Record<string, bigint> = {
      '2026-11': 400000n,
      '2026-10': 0n,
    }
    const micro = (amount: string) => BigInt(amount.replace('.', ''))
    for (const [index, month] of card.entries()) {
      const earlier = cardBefore[index]!
      expect(month.limit).toBe(earlier.limit)
      expect(month.settled).toBe(earlier.settled)
      expect(micro(earlier.reserved) - micro(month.held)).toBe(
        released[month.month],
      )
    }
  })

  it('T10-AC03: keeps the earlier records in the archive under new names, with no assignment created, and drops the old references and the fields of the former Profile path', async () => {
    for (const [old, archive] of Object.entries(archived)) {
      expect(
        (await pool.query('SELECT to_regclass($1) AS t', [old])).rows[0].t,
      ).toBeNull()
      expect(await count(archive)).toBeGreaterThan(0)
    }
    expect(await count('archive_ai_executions')).toBe(13)
    expect(await count('archive_ai_attempts')).toBe(13)
    expect(await count('ai_assignments')).toBe(0)
    expect(await count('ai_operations')).toBe(0)
    const columns = (
      await pool.query(
        `SELECT table_name,column_name FROM information_schema.columns
         WHERE table_schema=$1 AND (table_name,column_name) IN (
          ('archive_ai_executions','result_status'),('archive_ai_executions','error_code'),
          ('archive_ai_executions','disposition'),('archive_ai_executions','publication_allowed'),
          ('matching_requests','execution_id'),('company_research','execution_id'),
          ('profile_imports','current_execution_id'))`,
        [schema],
      )
    ).rows
    expect(columns).toEqual([])
  })

  it('T10-AC02: shows the unfinished preparations as failed with the message of a failed assignment, and leaves the ended one as it was', async () => {
    for (const id of [imports.queued, imports.waitingBudget, imports.running]) {
      const preparation = (await readImport(id))!
      expect(importStatusLabel(preparation.status as string)).toBe(
        'Wymaga sprawdzenia',
      )
      expect(preparation.error).toBe(
        'Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI.',
      )
    }
    expect((await readImport(imports.prepared))!.status).toBe('proposal')
    expect((await listImports()).map((row) => row.status).sort()).toEqual([
      'needs_attention',
      'needs_attention',
      'needs_attention',
      'proposal',
    ])
  })

  it('T10-AC02, T10-AC06: shows the unfinished assessment as failed, and an offer assessed before still shows its assessment, with no cost, no entry of earlier work without an assessment and no exchange view', async () => {
    const assessing = await readMatching(ads.assessing)
    expect(assessing.history).toMatchObject([
      { id: requests.unfinished, state: 'failed', assignment: false },
    ])
    expect(matchingDetailLabels[assessing.history[0]!.state]).toBe(
      'Ocena nie powiodła się',
    )

    const assessed = await readMatching(ads.assessed)
    expect(assessed.current).toMatchObject({ request_id: requests.published })
    expect(assessed.history.map((row) => [row.id, row.state])).toEqual([
      [requests.excluded, 'excluded'],
      [requests.published, 'completed'],
    ])
    expect(assessed.history[1]!.result).toEqual(assessment)
    for (const row of assessed.history) {
      expect(row).not.toHaveProperty('cost')
      expect(row.assignment).toBe(false)
    }
    expect(await readAssessmentExchange(requests.published)).toBeNull()

    // The offer list shows the latest request the history shows.
    const offers = await decorateMatching([
      { id: ads.assessed } as OfferView,
      { id: ads.assessing } as OfferView,
    ])
    expect(offers.map((offer) => offer.assessment?.state)).toEqual([
      'excluded',
      'failed',
    ])
  })

  it('T10-AC02, T10-AC07: shows the unfinished research as failed, and a company with a report saved before still shows it, with no cost and no entry of earlier research without a report', async () => {
    const researching = await readCompanyResearch(companies.researching)
    expect(researching.operations).toMatchObject([
      { id: research.unfinished, state: 'failed' },
    ])
    expect(researchStateLabels[researching.operations[0]!.state]).toBe(
      'Nie udało się przygotować raportu',
    )

    const reported = await readCompanyResearch(companies.reported)
    expect(reported.operations).toEqual([
      {
        id: research.completed,
        target: expect.any(Object),
        report,
        state: 'completed',
        error: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        finishedAt: '2026-11-01T10:00:00.000Z',
      },
    ])
  })

  it('T10-AC02: the failed matters can be requested again, each by a new assignment', async () => {
    expect(await prepareProposal(imports.running, 'PHP developer', 1)).toEqual({
      state: 'in_progress',
    })
    const assessment = await enqueueMatching(ads.assessing)
    expect(assessment).toMatchObject({ reused: false, state: 'running' })
    expect(assessment.id).not.toBe(requests.unfinished)
    const researched = await requestResearch(companies.researching, {
      commandId: randomUUID(),
      refresh: true,
    })
    expect(researched.reused).toBe(false)
    expect(researched.id).not.toBe(research.unfinished)
    expect(await count('ai_assignments')).toBe(3)
    // A matter with an assignment is left to its receiver by the next run
    // of the migration step.
    expect(await failPreparationsOfOldWay()).toBe(0)
    expect(await failAssessmentsOfOldWay()).toBe(0)
    expect(await failResearchOfOldWay()).toBe(0)
    expect((await readImport(imports.running))!.status).toBe('ai_running')
  })
})
