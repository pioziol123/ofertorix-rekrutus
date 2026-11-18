import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { emptyProfile } from '../lib/profile/model.ts'
import {
  readBudget,
  readExecutionHistory,
  registerResultReceiver,
  useAiQueue,
} from '../modules/ai/index.ts'
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import { endedBatchGroups } from '../modules/ai/infrastructure/persistence/executions.ts'
import {
  assessmentReceiver,
  assessmentSettingsKey,
} from '../modules/matching/index.ts'
import { enqueueMatching, readMatching } from '../lib/matching/store.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  matchingMigrations,
  migrate,
  pricing,
  recordingQueue,
  SimulatedOpenAi,
} from './matching-ai.fixtures.ts'

vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/**
 * The migration that moves Matching's assessments to the AI coordination
 * (0mq.21), on requests, attempts and groups the old batch paths left
 * behind (AM-AC03).
 */
integration('migration of the assessment history to AI executions', () => {
  const schema = `matching_ai_migration_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  const queue = recordingQueue()
  // Two ads: an ad had at most one request in progress before the migration.
  const ad = randomUUID(),
    otherAd = randomUUID(),
    revision = randomUUID(),
    otherRevision = randomUUID(),
    profile = randomUUID(),
    group = randomUUID()
  const month = budgetMonth()
  const ids = {
    completed: randomUUID(),
    rejected: randomUUID(),
    refused: randomUUID(),
    uploadFailed: randomUUID(),
    unknown: randomUUID(),
    submitted: randomUUID(),
    waiting: randomUUID(),
    excluded: randomUUID(),
    groupMember: randomUUID(),
  }
  const attempts = Object.fromEntries(
    Object.keys(ids).map((key) => [key, randomUUID()]),
  ) as Record<keyof typeof ids, string>
  const result = {
    summary: 'Brak danych',
    strengths: [],
    gaps: [],
    criteria: [],
  }

  /** A request and its attempt as the old batch path saved them. */
  async function legacy(
    key: keyof typeof ids,
    state: string,
    options: {
      error?: string
      attempt?: { state: string; reserved: string; actual: string | null }
      result?: unknown
      group?: string
      at: string
      other?: boolean
    },
  ) {
    const attempt = options.attempt ? attempts[key] : null
    if (options.attempt)
      await pool.query(
        `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration)
         VALUES($1,NULL,0,$2,1,$3,'matching',$4,$5,$6,$7)`,
        [
          attempt,
          month,
          ids[key],
          options.attempt.state,
          options.attempt.reserved,
          options.attempt.actual,
          pricing,
        ],
      )
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,attempt_id,state,result,calculation,error,group_id,request_payload,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
      [
        ids[key],
        options.other ? otherAd : ad,
        options.other ? otherRevision : revision,
        profile,
        { profile: 'p', offer: 'o', criteria: [], checks: [] },
        pricing,
        attempt,
        state,
        options.result ?? null,
        options.result ? { rating: null, completeness: 0 } : null,
        options.error ?? null,
        options.group ?? null,
        { model: 'test-only' },
        options.at,
      ],
    )
  }

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    await migrate(pool, matchingMigrations.slice(0, -1))
    setPool(pool)
    useAiQueue(queue.boss)
    registerResultReceiver(assessmentSettingsKey, assessmentReceiver)
    const scope = randomUUID()
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
      [revision, ad, { title: 'PHP developer', skills: [{ name: 'PHP' }] }],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [ad, revision],
    )
    await pool.query(
      "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
      [otherAd, randomUUID(), scope],
    )
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test','{}')",
      [otherRevision, otherAd],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [otherAd, otherRevision],
    )
    await pool.query(
      'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,1,$2,$3,1)',
      [profile, emptyProfile(), randomUUID()],
    )
    await pool.query(
      'INSERT INTO profile_head(singleton,active_version_id) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET active_version_id=excluded.active_version_id',
      [profile],
    )
    await pool.query(
      'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,1)',
      [month],
    )
    // The group ended, but removing its files at the provider failed.
    await pool.query(
      "INSERT INTO matching_groups(id,command_id,ad_ids,state,configuration,input_file_id,batch_id,output_file_id,status,cleaned) VALUES($1,$2,$3,'completed',$4,'file_in_group','batch_old','file_out_group','completed',false)",
      [group, randomUUID(), [ad], pricing],
    )
    await legacy('completed', 'completed', {
      attempt: { state: 'settled', reserved: '0.5', actual: '0.000120' },
      result,
      at: '2026-11-01T10:00:00Z',
    })
    await legacy('rejected', 'failed', {
      attempt: { state: 'settled', reserved: '0.5', actual: '0.000130' },
      error:
        'Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: missing_criterion]',
      at: '2026-11-02T10:00:00Z',
    })
    await legacy('refused', 'failed', {
      attempt: { state: 'settled', reserved: '0.5', actual: '0.000140' },
      error:
        'Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: response_refusal]',
      at: '2026-11-03T10:00:00Z',
    })
    await legacy('uploadFailed', 'failed', {
      attempt: { state: 'settled', reserved: '0.5', actual: '0' },
      error:
        'Nie udało się przesłać pliku Batch. Nie zlecono analizy. [Batch: http; HTTP 403]',
      at: '2026-11-04T10:00:00Z',
    })
    await legacy('unknown', 'unknown', {
      attempt: { state: 'unknown', reserved: '0.5', actual: null },
      error:
        'Nie udało się potwierdzić utworzenia partii. Nie ponowiono automatycznie. [Batch: network]',
      at: '2026-11-05T10:00:00Z',
    })
    await legacy('submitted', 'submitted', {
      attempt: { state: 'running', reserved: '0.5', actual: null },
      at: '2026-11-06T10:00:00Z',
    })
    await legacy('waiting', 'waiting_budget', {
      at: '2026-11-07T10:00:00Z',
      other: true,
    })
    await legacy('excluded', 'excluded', { at: '2026-11-08T10:00:00Z' })
    await legacy('groupMember', 'completed', {
      attempt: { state: 'settled', reserved: '0.5', actual: '0.000150' },
      result,
      group,
      at: '2026-11-09T10:00:00Z',
    })
    // Single batches whose files were not removed at the provider: one that
    // ended and whose cleanup failed, and one submitted at the deploy.
    await pool.query(
      `INSERT INTO matching_batches(request_id,input_file_id,batch_id,output_file_id,status,cleaned)
       VALUES($1,'file_in_single','batch_single','file_out_single','completed',false),
             ($2,'file_in_submitted','batch_submitted',NULL,'in_progress',false)`,
      [ids.completed, ids.submitted],
    )
    await migrate(pool, ['1770000000018_matching_ai_executions'])
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  it('shows every assessment made before the migration with its state and cost read from AI executions (AM-AC03)', async () => {
    const history = new Map(
      [
        ...(await readMatching(ad)).history,
        ...(await readMatching(otherAd)).history,
      ].map((row) => [row.id, row]),
    )
    expect(history.size).toBe(Object.keys(ids).length)
    const shown = (key: keyof typeof ids) => {
      const row = history.get(ids[key])!
      return { state: row.state, cost: row.cost }
    }
    expect(shown('completed')).toEqual({
      state: 'completed',
      cost: { reserved: '0.500000', actual: '0.000120' },
    })
    expect(shown('rejected')).toEqual({
      state: 'failed',
      cost: { reserved: '0.500000', actual: '0.000130' },
    })
    expect(shown('refused')).toEqual({
      state: 'failed',
      cost: { reserved: '0.500000', actual: '0.000140' },
    })
    expect(shown('uploadFailed')).toEqual({
      state: 'failed',
      cost: { reserved: '0.500000', actual: '0.000000' },
    })
    // An unknown outcome stays uncertain with its reservation.
    expect(shown('unknown')).toEqual({
      state: 'unknown',
      cost: { reserved: '0.500000', actual: null },
    })
    // Work in progress is not carried over: it ends and releases its
    // reservation (decision 3 of 0mq.17).
    expect(shown('submitted')).toEqual({
      state: 'failed',
      cost: { reserved: '0.500000', actual: '0.000000' },
    })
    expect(shown('waiting')).toEqual({
      state: 'failed',
      cost: { reserved: '0.000000', actual: '0.000000' },
    })
    expect(shown('excluded')).toEqual({ state: 'excluded', cost: null })
    expect(shown('groupMember')).toEqual({
      state: 'completed',
      cost: { reserved: '0.500000', actual: '0.000150' },
    })
    // Messages and results stay with the requests.
    expect(history.get(ids.completed)!.result).toEqual(result)
    expect(history.get(ids.rejected)!.error).toContain('missing_criterion')
  })

  it("maps each old state to the stage and cause of its execution, or to Matching's own state (0mq.21 ASM-1)", async () => {
    const execution = async (key: keyof typeof ids) =>
      (await readExecutionHistory(ids[key])).at(-1)
    expect(await execution('completed')).toMatchObject({
      id: attempts.completed,
      settingsKey: 'matching',
      mode: 'batch',
      groupId: ids.completed,
      state: 'completed',
      cause: null,
      result,
      usage: null,
    })
    expect(await execution('rejected')).toMatchObject({
      state: 'rejected',
      cause: null,
      rejectionReason: 'missing_criterion',
      result: null,
    })
    expect(await execution('refused')).toMatchObject({
      state: 'failed',
      cause: 'refused',
    })
    expect(await execution('uploadFailed')).toMatchObject({
      state: 'failed',
      cause: 'http',
    })
    expect(await execution('unknown')).toMatchObject({
      state: 'uncertain',
      cause: 'network',
    })
    expect(await execution('submitted')).toMatchObject({
      state: 'retried',
      cause: 'interrupted',
    })
    expect(await execution('waiting')).toMatchObject({
      id: ids.waiting,
      state: 'retried',
      cause: 'interrupted',
    })
    expect(await execution('excluded')).toBeUndefined()
    expect(await execution('groupMember')).toMatchObject({
      groupId: group,
      state: 'completed',
    })
    const requests = (
      await pool.query(
        'SELECT id,state,execution_id FROM matching_requests ORDER BY created_at',
      )
    ).rows
    expect(requests.map((r) => [r.state, r.execution_id === null])).toEqual(
      Object.keys(ids).map((key) => [
        key === 'excluded' ? 'excluded' : 'requested',
        key === 'excluded',
      ]),
    )
  })

  it('does not carry the provider file cleanup of batches from before the migration into AI (0mq.21 ASM-9)', async () => {
    const moved = (
      await pool.query(
        'SELECT e.id,e.adapter_state FROM ai_executions e JOIN matching_requests r ON r.execution_id=e.id WHERE r.id = ANY($1)',
        [[ids.completed, ids.submitted, ids.groupMember]],
      )
    ).rows
    expect(moved).toHaveLength(3)
    expect(moved.map((row) => row.adapter_state)).toEqual([null, null, null])
    const cleaned = (await endedBatchGroups()).map((g) => g.executionId)
    for (const row of moved) expect(cleaned).not.toContain(row.id)
  })

  it('keeps reserved only the cost of the uncertain outcome', async () => {
    expect(await readBudget()).toMatchObject({
      reserved: '0.500000',
      settled: '0.000540',
    })
  })

  it('accepts new assessments of the ad through AI after the migration', async () => {
    usePricing('matching', pricing, ['single', 'batch'])
    vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
    new SimulatedOpenAi()
    const request = await enqueueMatching(ad)
    expect(request.reused).toBe(false)
    await queue.work()
    expect((await readMatching(ad)).history[0]).toMatchObject({
      id: request.id,
      state: 'completed',
      cost: { actual: '0.000120' },
    })
    vi.unstubAllEnvs()
  })
})
