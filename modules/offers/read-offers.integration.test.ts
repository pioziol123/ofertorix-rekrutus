import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../lib/db.ts'
import { readOffer } from './read-offer.ts'
import { readOffers } from './read-offers.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('offer reader in an isolated PostgreSQL schema', () => {
  const schema = `offer_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool
  const id = randomUUID(),
    oldRevision = randomUUID(),
    currentRevision = randomUUID()
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const sql: string[] = []
    createRequire(import.meta.url)(
      '../../migrations/1770000000001_sources.cjs',
    ).up({ sql: (s: string) => sql.push(s) })
    await pool.query(sql.join('\n'))
    setPool(pool)
    const scope = randomUUID()
    await pool.query(
      'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
      [scope, 'test', schema, {}],
    )
    await pool.query(
      'INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id) VALUES($1,$2,$3,$4,$5)',
      [id, 'test', 'external', 'javascript:alert(1)', scope],
    )
    await pool.query(
      `INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload,retrieved_at) VALUES($1,$3,'old',$4,'2026-10-01'),($2,$3,'current',$5,'2026-10-02')`,
      [
        oldRevision,
        currentRevision,
        id,
        { title: 'Old private payload' },
        {
          title: 'Current PHP',
          company: 'TestCo',
          description: '<p>Current description</p>',
          salary: null,
          skills: [{ name: 'PHP', level: 'Advanced' }],
        },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, currentRevision],
    )
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('reads the current revision, safe link, and history dates without former payloads', async () => {
    const offer = await readOffer(id)
    expect(offer).toMatchObject({
      id,
      title: 'Current PHP',
      company: 'TestCo',
      description: 'Current description',
      url: null,
      salaries: [],
    })
    expect(offer!.revisions.map((r) => r.id)).toEqual([
      currentRevision,
      oldRevision,
    ])
    expect(JSON.stringify(offer)).not.toContain('Old private payload')
    const offers = await readOffers()
    expect(offers).toHaveLength(1)
    expect(offers[0]!.title).toBe('Current PHP')
  })
  it('rejects invalid/missing identifiers without interpolating SQL', async () => {
    expect(await readOffer("' OR 1=1 --")).toBeNull()
    expect(await readOffer(randomUUID())).toBeNull()
    expect(await readOffers()).toHaveLength(1)
  })
})
