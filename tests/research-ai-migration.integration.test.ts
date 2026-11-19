import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  readBudget,
  readExecutionHistory,
  useAiQueue,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import {
  readCompanyResearch,
  requestResearch,
} from '../modules/companies/index.ts'
import { pricing, researchMigrations } from './company-research.fixtures.ts'
import { recordingQueue } from './matching-ai.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'

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

async function migrate(pool: Pool, names: string[]) {
  const statements: string[] = []
  for (const name of names)
    createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
      sql: (s: string) => statements.push(s),
    })
  await pool.query(statements.join('\n'))
}

/**
 * The migration that moves company research to AI executions (0mq.22), on
 * research and attempts the old research queue left behind (AC-AC03).
 */
integration('migration of the research history to AI executions', () => {
  const schema = `research_ai_migration_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  const month = budgetMonth()
  const companies = [randomUUID(), randomUUID(), randomUUID()]
  const report = { identity: 'Firma', claims: [] }
  const ids = {
    completed: randomUUID(),
    noFindings: randomUUID(),
    invalid: randomUUID(),
    uncited: randomUUID(),
    synthesis: randomUUID(),
    http: randomUUID(),
    network: randomUUID(),
    waiting: randomUUID(),
    queued: randomUUID(),
    running: randomUUID(),
  }
  const target = (name: string) => ({
    name,
    kind: 'brand',
    website: null,
    description: '',
  })

  /** A research and its attempt as the old research queue saved them. */
  async function legacy(
    key: keyof typeof ids,
    state: string,
    options: {
      company?: number
      error?: string
      attempt?: { state: string; reserved: string; actual: string | null }
      at: string
    },
  ) {
    const attemptId = options.attempt ? randomUUID() : null
    if (options.attempt)
      await pool.query(
        `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,usage,response_id)
         VALUES($1,NULL,0,$2,1,$3,'research',$4,$5,$6,$7,$8,$9)`,
        [
          attemptId,
          month,
          ids[key],
          options.attempt.state,
          options.attempt.reserved,
          options.attempt.actual,
          pricing,
          { input_tokens: 8300, output_tokens: 120, search_calls: 1 },
          'search-id,synthesis-id',
        ],
      )
    const ended = ['completed', 'failed', 'unknown'].includes(state)
    await pool.query(
      `INSERT INTO company_research(id,company_id,target,configuration,state,attempt_id,result,error,created_at,finished_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ids[key],
        companies[options.company ?? 0],
        target(key),
        pricing,
        state,
        attemptId,
        state === 'completed' ? report : null,
        options.error ?? null,
        options.at,
        ended ? options.at : null,
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
    await migrate(pool, researchMigrations)
    await pool.query(
      'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,100)',
      [month],
    )
    for (const [index, id] of companies.entries())
      await pool.query(
        "INSERT INTO companies(id,name,kind,description) VALUES($1,$2,'brand','')",
        [id, `Company ${index}`],
      )
    const settled = (actual: string) => ({
      state: 'settled',
      reserved: '0.536000',
      actual,
    })
    await legacy('completed', 'completed', {
      attempt: settled('0.073680'),
      at: '2026-11-01T10:00:00Z',
    })
    await legacy('noFindings', 'failed', {
      attempt: settled('0.073680'),
      error:
        'Raport nie zawiera żadnych ustaleń popartych źródłami. Nie uznano go za gotowy research. Poprzedni raport pozostaje dostępny. Ponowienie wymaga nowego żądania i kosztu.',
      at: '2026-11-02T10:00:00Z',
    })
    await legacy('invalid', 'failed', {
      attempt: settled('0.073680'),
      error:
        'Nie udało się uzyskać kompletnego raportu z dowodami (validation). Poprzedni raport pozostaje dostępny.',
      at: '2026-11-03T10:00:00Z',
    })
    await legacy('uncited', 'failed', {
      attempt: settled('0.072600'),
      error:
        'Wyszukiwanie nie dostarczyło materiałów z poprawnymi cytowaniami. Nie przygotowano raportu ani nie uruchomiono syntezy. Ponowienie wymaga nowego żądania i kosztu.',
      at: '2026-11-04T10:00:00Z',
    })
    await legacy('synthesis', 'failed', {
      attempt: settled('0.073680'),
      error:
        'Nie udało się uzyskać kompletnego raportu z dowodami (synthesis). Poprzedni raport pozostaje dostępny.',
      at: '2026-11-05T10:00:00Z',
    })
    await legacy('http', 'unknown', {
      attempt: { state: 'unknown', reserved: '0.536000', actual: null },
      error:
        'Usługa researchu zwróciła HTTP 500. Koszt pozostaje zarezerwowany.',
      at: '2026-11-06T10:00:00Z',
    })
    await legacy('network', 'unknown', {
      attempt: { state: 'unknown', reserved: '0.536000', actual: null },
      error:
        'Nie udało się uzyskać kompletnego raportu z dowodami (search). Poprzedni raport pozostaje dostępny.',
      at: '2026-11-07T10:00:00Z',
    })
    // One research in progress per company before the migration.
    await legacy('waiting', 'waiting_budget', {
      company: 1,
      at: '2026-11-08T10:00:00Z',
    })
    await legacy('queued', 'queued', {
      company: 2,
      attempt: { state: 'queued', reserved: '0.536000', actual: null },
      at: '2026-11-09T10:00:00Z',
    })
    await legacy('running', 'running', {
      attempt: { state: 'running', reserved: '0.536000', actual: null },
      at: '2026-11-10T10:00:00Z',
    })
    await migrate(pool, ['1770000000019_research_ai_executions'])
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  it('AC-AC03: shows each research made before the migration with its state and cost read from AI executions', async () => {
    const operations = (await readCompanyResearch(companies[0]!)).operations
    const byId = new Map(operations.map((o) => [o.id, o]))
    const settled = (cost: string) => ({
      cost,
      costState: 'settled',
      reserved: '0.536000',
    })
    expect(byId.get(ids.completed)).toMatchObject({
      state: 'completed',
      report,
      error: null,
      finishedAt: '2026-11-01T10:00:00.000Z',
      ...settled('0.073680'),
    })
    for (const key of [
      'noFindings',
      'invalid',
      'uncited',
      'synthesis',
    ] as const)
      expect(byId.get(ids[key])).toMatchObject({
        state: 'failed',
        report: null,
        error: expect.any(String),
        ...settled(key === 'uncited' ? '0.072600' : '0.073680'),
      })
    for (const key of ['http', 'network'] as const)
      expect(byId.get(ids[key])).toMatchObject({
        state: 'unknown',
        cost: null,
        costState: 'unknown',
        reserved: '0.536000',
        error: expect.stringContaining(key === 'http' ? 'HTTP 500' : 'search'),
      })
    // The usage of each adopted attempt, its paid search calls included,
    // is read back from AI. ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
    for (const key of ['completed', 'uncited', 'http'] as const)
      expect((await readExecutionHistory(ids[key]))[0]?.usage).toEqual({
        inputTokens: 8300,
        outputTokens: 120,
        toolCalls: 1,
      })
    // Work in progress at the deploy ended, with its reservation released.
    expect(byId.get(ids.running)).toMatchObject({
      state: 'failed',
      cost: '0.000000',
      costState: 'settled',
      error: expect.stringContaining('Research przerwano'),
    })
    for (const [key, company] of [
      ['waiting', 1],
      ['queued', 2],
    ] as const)
      expect(
        (await readCompanyResearch(companies[company]!)).operations,
      ).toMatchObject([
        {
          id: ids[key],
          state: 'failed',
          cost: '0.000000',
          costState: 'settled',
        },
      ])
  })

  it('maps each old state and message to the stage and cause of its execution (0mq.22 ASM-1)', async () => {
    const history = async (key: keyof typeof ids) =>
      (await readExecutionHistory(ids[key]))[0]
    const expected = {
      completed: { state: 'completed', cause: null, rejectionReason: null },
      noFindings: {
        state: 'rejected',
        cause: null,
        rejectionReason: 'no_sourced_findings',
      },
      invalid: {
        state: 'rejected',
        cause: null,
        rejectionReason: 'invalid_report',
      },
      uncited: { state: 'failed', cause: 'no_content' },
      synthesis: { state: 'failed', cause: 'unknown' },
      http: { state: 'uncertain', cause: 'http' },
      network: { state: 'uncertain', cause: 'unknown' },
      waiting: { state: 'retried', cause: 'interrupted' },
      queued: { state: 'retried', cause: 'interrupted' },
      running: { state: 'retried', cause: 'interrupted' },
    }
    for (const [key, value] of Object.entries(expected))
      expect(await history(key as keyof typeof ids)).toMatchObject({
        settingsKey: 'research',
        mode: 'agent',
        ...value,
      })
    expect((await history('completed'))?.result).toEqual(report)
    // Only the uncertain outcomes keep their reservation.
    expect((await readBudget()).reserved).toBe('1.072000')
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM company_research WHERE state<>'requested' OR execution_id IS NULL",
        )
      ).rows[0].n,
    ).toBe(0)
  })

  it('lets a company whose research was in progress at the deploy request it again, and reuses the published report of another', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-send')
    usePricing('research', pricing, 'agent')
    useAiQueue(recordingQueue().boss)
    const again = await requestResearch(companies[1]!, {
      commandId: randomUUID(),
      refresh: false,
    })
    expect(again.reused).toBe(false)
    expect(
      await requestResearch(companies[0]!, {
        commandId: randomUUID(),
        refresh: false,
      }),
    ).toEqual({ id: ids.completed, reused: true })
  })
})
