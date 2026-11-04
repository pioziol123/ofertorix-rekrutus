import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { get } from 'node:http'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readOffer, readOffers } from '../lib/offers.ts'

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
      '../migrations/1770000000001_sources.cjs',
    ).up({ sql: (s: string) => sql.push(s) })
    await pool.query(sql.join('\n'))
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
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('reads the current revision, safe link, and history dates without former payloads', async () => {
    const offer = await readOffer(pool, id)
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
    const offers = await readOffers(pool)
    expect(offers).toHaveLength(1)
    expect(offers[0]!.title).toBe('Current PHP')
  })
  it('rejects invalid/missing identifiers without interpolating SQL', async () => {
    expect(await readOffer(pool, "' OR 1=1 --")).toBeNull()
    expect(await readOffer(pool, randomUUID())).toBeNull()
    expect(await readOffers(pool)).toHaveLength(1)
  })
})

function http(
  path: string,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const request = get(
      new URL(path, process.env.WEB_BASE_URL ?? 'http://web:3000'),
      { headers: { Host: 'localhost' } },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          body += chunk
        })
        response.on('end', () => resolve({ status: response.statusCode, body }))
        response.on('error', reject)
      },
    )
    request.setTimeout(10000, () => request.destroy(new Error('HTTP timeout')))
    request.on('error', reject)
  })
}
integration('local offers HTTP without login', () => {
  it('serves a paginated list and detail without a session cookie', async () => {
    const response = await http('/api/offers')
    expect(response.status).toBe(200)
    const data = JSON.parse(response.body)
    expect(data.pageSize).toBe(20)
    expect(data.items.length).toBeLessThanOrEqual(20)
    expect(data.total).toBeGreaterThanOrEqual(data.items.length)
    if (data.items[0]) {
      const detail = await http(`/api/offers/${data.items[0].id}`)
      expect(detail.status).toBe(200)
      expect(JSON.parse(detail.body).id).toBe(data.items[0].id)
    }
    const invalid = await http('/api/offers?minSalary=25000')
    expect(invalid.status).toBe(400)
    expect((await http('/api/offers/not-a-uuid')).status).toBe(404)
  })
  it('renders the list on direct navigation without login', async () => {
    const response = await http('/offers')
    expect(response.status).toBe(200)
    expect(response.body).toContain('Wszystkie oferty')
    expect(response.body).not.toContain('Hasło właściciela')
  }, 15000)
})
