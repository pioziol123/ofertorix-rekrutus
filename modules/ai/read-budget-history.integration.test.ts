import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../lib/db.ts'
import { readBudgetHistory } from './index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('reading the AI budget history in isolated PostgreSQL', () => {
  const schema = `ai_budget_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const sql: string[] = []
    createRequire(import.meta.url)(
      '../../migrations/1770000000004_profiles.cjs',
    ).up({ sql: (s: string) => sql.push(s) })
    await pool.query(sql.join('\n'))
    setPool(pool)
  }, 30_000)

  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  it('ASSUMPTION(oferty-pracy-0mq.11/ASM-2): gives every budget month, newest first, with the amounts the profile page showed before', async () => {
    expect(await readBudgetHistory()).toEqual([])
    await pool.query(
      "INSERT INTO ai_budget_months(month,limit_pln) VALUES('2026-09','100'),('2026-10','50.5'),('2026-11','100')",
    )
    const importId = randomUUID()
    await pool.query(
      "INSERT INTO profile_imports(id,kind,status) VALUES($1,'text','ready')",
      [importId],
    )
    const attempt = (
      month: string,
      state: string,
      reserved: string,
      actual: string | null,
    ) =>
      pool.query(
        `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,state,reserved_pln,actual_pln,configuration)
         VALUES($1,$2,1,$3,1,$4,$5,$6,$7,'{}')`,
        [randomUUID(), importId, month, randomUUID(), state, reserved, actual],
      )
    await attempt('2026-11', 'settled', '0.5', '0.123456')
    await attempt('2026-11', 'running', '0.25', null)
    await attempt('2026-10', 'settled', '0.3', '0.2')
    // The amounts as the profile route summed them before the change.
    const before = (
      await pool.query(`SELECT b.month,b.limit_pln,coalesce(sum(CASE WHEN a.state='settled' THEN a.actual_pln ELSE 0 END),0) AS spent,
 coalesce(sum(CASE WHEN a.state!='settled' THEN a.reserved_pln ELSE 0 END),0) AS reserved FROM ai_budget_months b LEFT JOIN ai_attempts a ON a.month=b.month GROUP BY b.month ORDER BY b.month DESC`)
    ).rows
    const history = await readBudgetHistory()
    expect(
      history.map((period) => ({
        month: period.month,
        limit_pln: period.limit,
        spent: period.settled,
        reserved: period.reserved,
      })),
    ).toEqual(before)
    expect(history).toEqual([
      {
        month: '2026-11',
        limit: '100.000000',
        settled: '0.123456',
        reserved: '0.250000',
      },
      {
        month: '2026-10',
        limit: '50.500000',
        settled: '0.200000',
        reserved: '0',
      },
      { month: '2026-09', limit: '100.000000', settled: '0', reserved: '0' },
    ])
  })
})
