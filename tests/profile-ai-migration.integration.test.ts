import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  readExecutionHistory,
  registerResultReceiver,
  useAiQueue,
} from '../modules/ai/index.ts'
import {
  proposalReceiver,
  proposalSettingsKey,
  readImport,
  resumeProposalPreparations,
} from '../modules/profile/index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/**
 * The migration that moves the Profile's proposal preparation to the AI
 * coordination, on rows the old paid and local paths left behind.
 */
integration('migration of the profile AI rows', () => {
  const schema = `profile_ai_migration_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  const migrate = async (names: string[]) => {
    const sql: string[] = []
    for (const name of names)
      createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
        sql: (s: string) => sql.push(s),
      })
    await pool.query(sql.join('\n'))
  }
  const proposal = { summary: 'Saved', skills: [], experience: [] }
  const ids = {
    paidQueued: randomUUID(),
    paidRunning: randomUUID(),
    paidDone: randomUUID(),
    paidRetried: randomUUID(),
    paidRejected: randomUUID(),
    paidRefused: randomUUID(),
    localDone: randomUUID(),
    localLost: randomUUID(),
    localRejected: randomUUID(),
    localRefused: randomUUID(),
    localQueued: randomUUID(),
  }
  const imports = Object.fromEntries(
    Object.keys(ids).map((key) => [key, randomUUID()]),
  ) as Record<keyof typeof ids, string>

  async function legacyImport(id: string, status: string) {
    await pool.query(
      "INSERT INTO profile_imports(id,kind,status,source_text,sha256,text_revision) VALUES($1,'text',$2,'PHP','x',1)",
      [id, status],
    )
    await pool.query(
      "INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,1,'PHP')",
      [id],
    )
  }
  async function paidAttempt(
    id: string,
    importId: string,
    state: string,
    extra: {
      proposal?: unknown
      generation?: string
      attempt?: number
      error?: string
    } = {},
  ) {
    await pool.query(
      `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,state,reserved_pln,configuration,proposal,error)
       VALUES($1,$2,1,'2026-11',$3,$4,$5,'0.5','{"model":"m"}',$6,$7)`,
      [
        id,
        importId,
        extra.attempt ?? 1,
        extra.generation ?? randomUUID(),
        state,
        extra.proposal ?? null,
        extra.error ?? null,
      ],
    )
  }
  async function localExecution(
    id: string,
    importId: string,
    columns: {
      result_status: string | null
      error_code: string | null
      runtime_state: string
      attempt: string
      error?: string
    },
    proposalValue: unknown = null,
  ) {
    await pool.query(
      `INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,result_status,error_code,runtime_state)
       VALUES($1,'profile',$2,'{"provider":"ollama"}',$3,$4,$5,$6)`,
      [
        id,
        importId,
        randomUUID(),
        columns.result_status,
        columns.error_code,
        columns.runtime_state,
      ],
    )
    await pool.query(
      `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,state,reserved_pln,actual_pln,configuration,execution_id,proposal,error)
       VALUES($1,$2,1,NULL,1,$3,$4,0,0,'{}',$5,$6,$7)`,
      [
        randomUUID(),
        importId,
        randomUUID(),
        columns.attempt,
        id,
        proposalValue,
        columns.error ?? null,
      ],
    )
    await pool.query(
      'INSERT INTO ai_local_queue(execution_id,state) VALUES($1,$2)',
      [id, columns.result_status ? 'finished' : 'queued'],
    )
  }

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    await migrate([
      '1770000000001_sources',
      '1770000000004_profiles',
      '1770000000006_matching',
      '1770000000013_local_ai',
      '1770000000016_ai_execution_requests',
    ])
    await pool.query("INSERT INTO ai_budget_months VALUES('2026-11',100)")
    for (const [key, id] of Object.entries(imports))
      await legacyImport(
        id,
        key === 'paidDone'
          ? 'proposal'
          : key.endsWith('Queued')
            ? 'ai_queued'
            : key === 'paidRunning'
              ? 'ai_running'
              : 'needs_attention',
      )
    await paidAttempt(ids.paidQueued, imports.paidQueued, 'queued')
    await paidAttempt(ids.paidRunning, imports.paidRunning, 'running')
    await paidAttempt(ids.paidDone, imports.paidDone, 'settled', { proposal })
    const generation = randomUUID()
    await paidAttempt(ids.paidRetried, imports.paidRetried, 'unknown', {
      generation,
    })
    await paidAttempt(randomUUID(), imports.paidRetried, 'unknown', {
      generation,
      attempt: 2,
    })
    await paidAttempt(ids.paidRejected, imports.paidRejected, 'settled', {
      error:
        'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.',
    })
    await paidAttempt(ids.paidRefused, imports.paidRefused, 'settled', {
      error:
        'AI odmówiło przygotowania propozycji. Sprawdź tekst zawodowy. Profil pozostaje bez zmian.',
    })
    await localExecution(
      ids.localDone,
      imports.localDone,
      {
        result_status: 'completed',
        error_code: null,
        runtime_state: 'finished',
        attempt: 'settled',
      },
      proposal,
    )
    await localExecution(ids.localLost, imports.localLost, {
      result_status: 'failed',
      error_code: 'network',
      runtime_state: 'unknown',
      attempt: 'settled',
    })
    await localExecution(ids.localRejected, imports.localRejected, {
      result_status: 'failed',
      error_code: 'invalid_proposal',
      runtime_state: 'finished',
      attempt: 'settled',
      error:
        'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.',
    })
    await localExecution(ids.localRefused, imports.localRefused, {
      result_status: 'failed',
      error_code: 'invalid_proposal',
      runtime_state: 'finished',
      attempt: 'settled',
      error:
        'AI odmówiło przygotowania propozycji. Sprawdź tekst zawodowy. Profil pozostaje bez zmian.',
    })
    await localExecution(ids.localQueued, imports.localQueued, {
      result_status: null,
      error_code: null,
      runtime_state: 'not_started',
      attempt: 'queued',
    })
    await migrate(['1770000000017_profile_ai_executions'])
    setPool(pool)
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  const latest = async (key: keyof typeof ids) =>
    (await readExecutionHistory(imports[key])).at(-1)
  const attempt = async (executionId: string) =>
    (
      await pool.query(
        'SELECT state,actual_pln FROM ai_attempts WHERE execution_id=$1',
        [executionId],
      )
    ).rows[0]

  it('gives every paid attempt an execution with the import, the text revision and the proposal', async () => {
    expect(await latest('paidDone')).toMatchObject({
      id: ids.paidDone,
      settingsKey: 'profile',
      inputVersion: '1',
      state: 'completed',
      result: proposal,
      cause: null,
    })
    const history = await readExecutionHistory(imports.paidRetried)
    expect(history.map((e) => e.state)).toEqual(['retried', 'uncertain'])
  })
  it("tells the Profile's rejection of a paid result apart from the model's own failure", async () => {
    expect(await latest('paidRejected')).toMatchObject({
      state: 'rejected',
      cause: null,
      rejectionReason: 'unconfirmed_quote',
    })
    expect(await latest('paidRefused')).toMatchObject({
      state: 'failed',
      cause: 'refused',
      rejectionReason: null,
    })
  })
  it('ends work the old paths can no longer continue and releases what was not spent', async () => {
    expect(await latest('paidQueued')).toMatchObject({
      state: 'retried',
      cause: 'interrupted',
    })
    expect(await attempt(ids.paidQueued)).toEqual({
      state: 'settled',
      actual_pln: '0.000000',
    })
    expect(await latest('paidRunning')).toMatchObject({
      state: 'uncertain',
      cause: 'interrupted',
    })
    expect(await attempt(ids.paidRunning)).toEqual({
      state: 'unknown',
      actual_pln: null,
    })
    expect(await latest('localQueued')).toMatchObject({
      state: 'retried',
      cause: 'interrupted',
    })
    expect(
      (
        await pool.query(
          'SELECT state FROM ai_local_queue WHERE execution_id=$1',
          [ids.localQueued],
        )
      ).rows[0].state,
    ).toBe('finished')
  })
  it('moves the stage of the local path into state and cause', async () => {
    expect(await latest('localDone')).toMatchObject({
      state: 'completed',
      result: proposal,
      inputVersion: '1',
    })
    expect(await latest('localLost')).toMatchObject({
      state: 'uncertain',
      cause: 'network',
    })
    // Only the Profile's own rejection is a rejected result; a model's
    // failure that the former path recorded the same way is a failure.
    expect(await latest('localRejected')).toMatchObject({
      state: 'rejected',
      cause: null,
      rejectionReason: 'unconfirmed_quote',
    })
    expect(await latest('localRefused')).toMatchObject({
      state: 'failed',
      cause: 'refused',
      rejectionReason: null,
    })
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM ai_executions WHERE state IS NULL',
        )
      ).rows[0].n,
    ).toBe(0)
  })
  it('shows the owner the end of preparation that was in progress', async () => {
    expect(await readImport(imports.paidQueued)).toMatchObject({
      status: 'ai_queued',
      error: null,
    })
    expect(await readImport(imports.paidRunning)).toMatchObject({
      status: 'needs_attention',
      error: expect.stringContaining('Nie wiadomo, jak zakończyło się'),
    })
    expect((await readImport(imports.paidDone))!.status).toBe('proposal')
  })
  it('A9-AC03: requests again the preparations that had not started, as the former recovery resent them', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key-never-send')
    const send = vi.fn(async () => randomUUID())
    useAiQueue({ send } as unknown as PgBoss)
    registerResultReceiver(proposalSettingsKey, proposalReceiver)
    try {
      await resumeProposalPreparations()
      for (const key of ['paidQueued', 'localQueued'] as const) {
        const history = await readExecutionHistory(imports[key])
        expect(history.map((e) => e.state)).toEqual(['retried', 'queued'])
        expect(history[1]).toMatchObject({ inputVersion: '1', attempt: 1 })
        expect((await readImport(imports[key]))!.status).toBe('ai_queued')
      }
      expect(send).toHaveBeenCalledTimes(2)
      // Uncertain and finished work is left alone, and a second run has
      // no further effect.
      expect((await readExecutionHistory(imports.paidRunning)).length).toBe(1)
      await resumeProposalPreparations()
      expect(send).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('replaces the index of one attempt in progress per import', async () => {
    expect(
      (
        await pool.query(
          "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname IN ('profile_one_pending_ai','ai_one_active_execution')",
          [schema],
        )
      ).rows.map((r) => r.indexname),
    ).toEqual(['ai_one_active_execution'])
  })
})
