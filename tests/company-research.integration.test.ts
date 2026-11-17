import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { request } from 'node:http'
import { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { budgetMonth } from '../modules/ai/index.ts'
import { createCompany, CompanyConflict } from '../lib/companies/store.ts'
import {
  executeCompanyResearch,
  readCompanyResearch,
  recoverCompanyResearch,
  requestResearch,
} from '../lib/companies/research.ts'
import {
  draft,
  pricing,
  searchResponse,
  synthesisResponse,
} from './company-research.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'

// The settings and price lists AI keeps in code, replaced for the test.
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
integration('company research transactions in isolated PostgreSQL', () => {
  const schema = `research_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool, companyId: string
  const send = vi.fn().mockResolvedValue('mock-queue-id')
  const boss = { send } as unknown as PgBoss
  const command = (refresh = false) => ({ commandId: randomUUID(), refresh })
  const mockedProvider = () =>
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(searchResponse()))
      .mockResolvedValueOnce(Response.json(synthesisResponse()))
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 10,
    })
    const sql: string[] = []
    for (const migration of [
      '1770000000001_sources.cjs',
      '1770000000004_profiles.cjs',
      '1770000000006_matching.cjs',
      '1770000000010_companies.cjs',
      '1770000000011_company_research.cjs',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}`).up({
        sql: (s: string) => sql.push(s),
      })
    await pool.query(sql.join('\n'))
  })
  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-send')
    usePricing('research', pricing)
    send.mockClear()
    await pool.query(
      'TRUNCATE company_research_commands,company_research,ai_attempts,ai_budget_months,company_commands,companies CASCADE',
    )
    companyId = (
      await createCompany(pool, {
        commandId: randomUUID(),
        name: 'Research company',
        kind: 'brand',
        website: 'https://company.example',
        description: 'Owner supplied',
      })
    ).id
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('deduplicates concurrent commands and rejects changed command payload without another reservation', async () => {
    const value = command()
    const same = await Promise.all([
      requestResearch(pool, boss, companyId, value),
      requestResearch(pool, boss, companyId, value),
    ])
    expect(same[0]).toEqual(same[1])
    const concurrent = await Promise.all([
      requestResearch(pool, boss, companyId, command(true)),
      requestResearch(pool, boss, companyId, command()),
    ])
    expect(concurrent).toEqual([
      { id: same[0]!.id, reused: true },
      { id: same[0]!.id, reused: true },
    ])
    await expect(
      requestResearch(pool, boss, companyId, { ...value, refresh: true }),
    ).rejects.toBeInstanceOf(CompanyConflict)
    expect(send).toHaveBeenCalledTimes(1)
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
        .n,
    ).toBe(1)
    expect(send.mock.calls[0]![2]).toMatchObject({ retryLimit: 0 })
  })
  it('executes one paid research only, persists telemetry and reuses completed reports without requiring current configuration', async () => {
    const op = await requestResearch(pool, boss, companyId, command()),
      fetcher = mockedProvider()
    await Promise.all([
      executeCompanyResearch(pool, boss, op.id, fetcher),
      executeCompanyResearch(pool, boss, op.id, fetcher),
    ])
    await executeCompanyResearch(pool, boss, op.id, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(
      (await readCompanyResearch(pool, companyId)).operations[0],
    ).toMatchObject({
      state: 'completed',
      cost: '0.073680',
      reserved: '0.536000',
      costState: 'settled',
      report: { claims: expect.any(Array) },
    })
    const attempt = (await pool.query('SELECT * FROM ai_attempts')).rows[0]
    expect(attempt).toMatchObject({
      operation_type: 'research',
      response_id: 'search-id,synthesis-id',
      usage: { input_tokens: 8300, output_tokens: 120, search_calls: 1 },
    })
    usePricing('research', null)
    expect(await requestResearch(pool, boss, companyId, command())).toEqual({
      id: op.id,
      reused: true,
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
        .n,
    ).toBe(1)
  })
  it('keeps both completed versions after a successful explicit refresh', async () => {
    const first = await requestResearch(pool, boss, companyId, command())
    await executeCompanyResearch(pool, boss, first.id, mockedProvider())
    await pool.query(
      "UPDATE companies SET name='Changed owner name' WHERE id=$1",
      [companyId],
    )
    const second = await requestResearch(pool, boss, companyId, command(true))
    await executeCompanyResearch(pool, boss, second.id, mockedProvider())
    const operations = (await readCompanyResearch(pool, companyId)).operations
    expect(operations).toHaveLength(2)
    expect(operations.find((o) => o.id === first.id)).toMatchObject({
      state: 'completed',
      target: { name: 'Research company' },
      report: { claims: expect.any(Array) },
    })
    expect(operations.find((o) => o.id === second.id)).toMatchObject({
      state: 'completed',
      target: { name: 'Changed owner name' },
      report: { claims: expect.any(Array) },
    })
    expect(await requestResearch(pool, boss, companyId, command())).toEqual({
      id: second.id,
      reused: true,
    })
    expect(send).toHaveBeenCalledTimes(2)
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
        .n,
    ).toBe(2)
  })
  it('preserves the previous completed version and target snapshot when a refresh fails', async () => {
    const original = await requestResearch(pool, boss, companyId, command())
    await executeCompanyResearch(pool, boss, original.id, mockedProvider())
    await pool.query(
      "UPDATE companies SET name='Changed owner name' WHERE id=$1",
      [companyId],
    )
    const refreshed = await requestResearch(
      pool,
      boss,
      companyId,
      command(true),
    )
    expect(refreshed.id).not.toBe(original.id)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Ambiguous transport failure'))
    await executeCompanyResearch(pool, boss, refreshed.id, fetcher)
    const operations = (await readCompanyResearch(pool, companyId)).operations
    expect(operations.find((o) => o.id === original.id)).toMatchObject({
      state: 'completed',
      target: { name: 'Research company' },
      report: { claims: expect.any(Array) },
    })
    expect(operations.find((o) => o.id === refreshed.id)).toMatchObject({
      state: 'unknown',
      target: { name: 'Changed owner name' },
      cost: null,
      costState: 'unknown',
    })
    expect(await requestResearch(pool, boss, companyId, command())).toEqual({
      id: original.id,
      reused: true,
    })
  })
  it.each(['uncited search', 'all-unknown synthesis'])(
    'settles a failed %s refresh and preserves the previous report without retrying',
    async (failure) => {
      const original = await requestResearch(pool, boss, companyId, command())
      await executeCompanyResearch(pool, boss, original.id, mockedProvider())
      const refreshed = await requestResearch(
        pool,
        boss,
        companyId,
        command(true),
      )
      const searched = searchResponse()
      const synthesized = synthesisResponse()
      if (failure === 'uncited search')
        searched.output[1]!.content![0]!.annotations = []
      else
        synthesized.output[0]!.content[0]!.text = JSON.stringify({
          ...draft(),
          claims: draft().claims.map((claim) => ({
            ...claim,
            kind: 'unknown',
            evidence: [],
          })),
        })
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(searched))
        .mockResolvedValueOnce(Response.json(synthesized))
      await executeCompanyResearch(pool, boss, refreshed.id, fetcher)
      await executeCompanyResearch(pool, boss, refreshed.id, fetcher)
      const calls = failure === 'uncited search' ? 1 : 2
      const cost = failure === 'uncited search' ? '0.072600' : '0.073680'
      expect(fetcher).toHaveBeenCalledTimes(calls)
      const operations = (await readCompanyResearch(pool, companyId)).operations
      expect(operations.find((op) => op.id === refreshed.id)).toMatchObject({
        state: 'failed',
        report: null,
        costState: 'settled',
        cost,
        error: expect.any(String),
      })
      expect(operations.find((op) => op.id === original.id)).toMatchObject({
        state: 'completed',
        report: { claims: expect.any(Array) },
      })
      expect(await requestResearch(pool, boss, companyId, command())).toEqual({
        id: original.id,
        reused: true,
      })
      expect(send).toHaveBeenCalledTimes(2)
    },
  )
  it('shares the budget with profile attempts and includes search fees before funding waiting operations', async () => {
    const month = budgetMonth()
    await pool.query(
      'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,1)',
      [month],
    )
    const importId = randomUUID()
    await pool.query(
      "INSERT INTO profile_imports(id,kind,status) VALUES($1,'text','ready')",
      [importId],
    )
    await pool.query(
      "INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration) VALUES($1,$2,0,$3,1,$4,'profile','unknown',0.5,$5)",
      [randomUUID(), importId, month, randomUUID(), pricing],
    )
    const op = await requestResearch(pool, boss, companyId, command())
    // Tokens alone cost .416, but the .12 search fee makes .536 exceed remaining .5.
    expect(
      (await readCompanyResearch(pool, companyId)).operations[0],
    ).toMatchObject({ state: 'waiting_budget', reserved: null })
    expect(send).not.toHaveBeenCalled()
    await recoverCompanyResearch(pool, boss)
    expect(send).not.toHaveBeenCalled()
    await pool.query('UPDATE ai_budget_months SET limit_pln=2 WHERE month=$1', [
      month,
    ])
    await recoverCompanyResearch(pool, boss)
    expect(
      (await readCompanyResearch(pool, companyId)).operations[0],
    ).toMatchObject({ id: op.id, state: 'queued', reserved: '0.536000' })
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM ai_attempts WHERE operation_type='research'",
        )
      ).rows[0].n,
    ).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not reconcile running work while its execution session still holds the operation lock', async () => {
    const op = await requestResearch(pool, boss, companyId, command())
    const owner = await pool.connect()
    const lock = `research-operation-${op.id}`
    try {
      await owner.query('SELECT pg_advisory_lock(hashtext($1))', [lock])
      await owner.query(
        "UPDATE company_research SET state='running' WHERE id=$1",
        [op.id],
      )
      await owner.query("UPDATE ai_attempts SET state='running'")
      send.mockClear()
      await recoverCompanyResearch(pool, boss)
      expect(
        (await readCompanyResearch(pool, companyId)).operations[0],
      ).toMatchObject({
        state: 'running',
        costState: 'running',
        error: null,
        reserved: '0.536000',
      })
      expect(send).not.toHaveBeenCalled()
    } finally {
      await owner.query('SELECT pg_advisory_unlock(hashtext($1))', [lock])
      owner.release()
    }
  })
  it('marks interrupted running work unknown, keeps its reservation, and never automatically retries it', async () => {
    const op = await requestResearch(pool, boss, companyId, command())
    await pool.query(
      "UPDATE company_research SET state='running' WHERE id=$1",
      [op.id],
    )
    await pool.query("UPDATE ai_attempts SET state='running'")
    send.mockClear()
    await recoverCompanyResearch(pool, boss)
    await recoverCompanyResearch(pool, boss)
    const fetcher = mockedProvider()
    await executeCompanyResearch(pool, boss, op.id, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(
      (await readCompanyResearch(pool, companyId)).operations[0],
    ).toMatchObject({
      state: 'unknown',
      reserved: '0.536000',
      cost: null,
      costState: 'unknown',
    })
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
        .n,
    ).toBe(1)
  })
})

function http(
  path: string,
  method = 'GET',
  body?: unknown,
  origin?: string,
): Promise<{ status?: number; cache?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(path, process.env.WEB_BASE_URL ?? 'http://web:3000'),
      {
        method,
        headers: {
          Host: 'localhost',
          'Content-Type': 'application/json',
          ...(origin ? { Origin: origin } : {}),
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('error', reject)
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            cache: res.headers['cache-control'],
            body: text,
          }),
        )
      },
    )
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')))
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
integration('company research HTTP boundary without live paid calls', () => {
  it('returns 404 for nonexistent profiles and blocks cross-origin research requests', async () => {
    const missing = `/api/companies/${randomUUID()}/research`
    expect((await http(missing)).status).toBe(404)
    expect((await http('/api/companies/not-a-uuid/research')).status).toBe(404)
    expect(
      (
        await http(
          missing,
          'POST',
          { commandId: randomUUID(), refresh: false },
          'https://untrusted.example',
        )
      ).status,
    ).toBe(403)
    expect(
      (await http(missing, 'POST', { commandId: randomUUID(), refresh: false }))
        .status,
    ).toBe(403)
    expect((await http(missing, 'POST', {}, 'http://localhost')).status).toBe(
      422,
    )
    expect(
      (
        await http(
          missing,
          'POST',
          { commandId: randomUUID(), refresh: false },
          'http://localhost',
        )
      ).status,
    ).toBe(404)
  })
})
