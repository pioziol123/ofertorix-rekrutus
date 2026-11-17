import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { request } from 'node:http'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { companyRoles } from '../lib/companies/model.ts'
import {
  changeCompanyLink,
  CompanyConflict,
  CompanyNotFound,
  createCompany,
  listCompanies,
  offerCompanies,
  readCompany,
} from '../lib/companies/store.ts'
import { readOffer } from '../modules/offers/index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('company profiles in isolated PostgreSQL', () => {
  const schema = `company_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  let adId: string, revisionId: string
  const create = (name = 'Same name', kind = 'organization') =>
    createCompany(pool, {
      commandId: randomUUID(),
      name,
      kind,
      website: 'https://same.example',
      description: 'Owner evidence',
    })
  const link = (
    role = 'employer',
    expectedCompanyId: string | null = null,
    action = 'link',
  ) => ({
    commandId: randomUUID(),
    adId,
    role,
    expectedCompanyId,
    action,
    evidence: 'Confirmed explicitly',
  })
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const sql: string[] = []
    for (const migration of [
      '1770000000001_sources.cjs',
      '1770000000010_companies.cjs',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}`).up({
        sql: (s: string) => sql.push(s),
      })
    await pool.query(sql.join('\n'))
    setPool(pool)
  })
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE company_commands,company_link_history,company_ad_links,companies,source_ads,source_ad_revisions,source_scopes CASCADE',
    )
    adId = randomUUID()
    revisionId = randomUUID()
    const scope = randomUUID()
    await pool.query(
      'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
      [scope, 'test', randomUUID(), {}],
    )
    await pool.query(
      'INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id) VALUES($1,$2,$3,$4,$5)',
      [adId, 'test', randomUUID(), 'javascript:alert(1)', scope],
    )
    await pool.query(
      'INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,$3,$4)',
      [
        revisionId,
        adId,
        randomUUID(),
        {
          title: 'PHP role',
          company: 'Same name',
          description:
            '<p>Public description</p><script>secretScript()</script>',
          skills: [
            { name: 'PHP', optional: false },
            { name: 'Vue', optional: true },
            { name: 'Mystery' },
          ],
          sourceRecord: { private: 'Do not expose raw data' },
        },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [adId, revisionId],
    )
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('keeps same names and domains separate and suggestions never create or merge profiles', async () => {
    expect(await offerCompanies(pool, adId)).toEqual({
      name: 'Same name',
      links: [],
      suggestions: [],
    })
    const a = await create(),
      b = await create('Same name', 'brand'),
      c = await create('Same name Ltd', 'unknown')
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
    const suggestions = await offerCompanies(pool, adId)
    expect(suggestions!.suggestions.map((s) => s.id).sort()).toEqual(
      [a.id, b.id].sort(),
    )
    expect(suggestions!.links).toEqual([])
    await readCompany(pool, a.id)
    await listCompanies(pool)
    await offerCompanies(pool, adId)
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM companies')).rows[0]
        .count,
    ).toBe(3)
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM company_link_history',
        )
      ).rows[0].count,
    ).toBe(0)
  })
  it('replays create receipts, rejects changed payloads, and serializes concurrent retries', async () => {
    const command = {
      commandId: randomUUID(),
      name: 'Retry',
      kind: 'unknown',
      website: null,
      description: '',
    }
    const results = await Promise.all([
      createCompany(pool, command),
      createCompany(pool, command),
    ])
    expect(results[0]).toEqual(results[1])
    await expect(
      createCompany(pool, { ...command, name: 'Different' }),
    ).rejects.toBeInstanceOf(CompanyConflict)
    expect((await listCompanies(pool)).total).toBe(1)
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM company_commands'))
        .rows[0].count,
    ).toBe(1)
  })
  it('preserves all roles and required/optional/unknown technologies per offer without leaking raw payloads', async () => {
    const company = await create()
    for (const role of companyRoles)
      await changeCompanyLink(pool, company.id, link(role))
    const detail = await readCompany(pool, company.id)
    expect(detail!.offers).toHaveLength(1)
    expect(detail!.offers[0]!.roles.sort()).toEqual([...companyRoles].sort())
    expect(detail!.technologies.map((t) => [t.name, t.optional])).toEqual([
      ['PHP', false],
      ['Vue', true],
      ['Mystery', null],
    ])
    expect(
      detail!.technologies.every(
        (t) => t.adId === adId && t.roles.length === 3 && t.url === null,
      ),
    ).toBe(true)
    expect(detail!.offers[0]!.description).toBe('Public description')
    expect(detail!.history).toHaveLength(3)
    expect(JSON.stringify(detail)).not.toMatch(
      /secretScript|Do not expose raw data|sourceRecord/,
    )
    expect(
      (await listCompanies(pool, { sort: 'offers' })).items[0]!.offerCount,
    ).toBe(1)
  })
  it('has one winner for concurrent assignments and stale operations cannot unlink another company', async () => {
    const a = await create('A'),
      b = await create('B')
    const results = await Promise.allSettled([
      changeCompanyLink(pool, a.id, link()),
      changeCompanyLink(pool, b.id, link()),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult
    expect(rejection.reason).toBeInstanceOf(CompanyConflict)
    const current = (await offerCompanies(pool, adId))!.links[0]!.id
    const other = current === a.id ? b.id : a.id
    await expect(
      changeCompanyLink(pool, other, link('employer', current, 'unlink')),
    ).rejects.toBeInstanceOf(CompanyConflict)
    await expect(
      changeCompanyLink(pool, current, link('employer', null, 'unlink')),
    ).rejects.toBeInstanceOf(CompanyConflict)
    expect((await offerCompanies(pool, adId))!.links[0]!.id).toBe(current)
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM company_link_history',
        )
      ).rows[0].count,
    ).toBe(1)
  })
  it('keeps technologies scoped to each offer and role instead of inferring company requirements', async () => {
    const company = await create(),
      secondAd = randomUUID(),
      secondRevision = randomUUID()
    await pool.query(
      'INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id) SELECT $1,source,$2,$3,last_seen_scope_id FROM source_ads WHERE id=$4',
      [secondAd, randomUUID(), 'https://example.com/second', adId],
    )
    await pool.query(
      'INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,$3,$4)',
      [
        secondRevision,
        secondAd,
        randomUUID(),
        { title: 'Data role', skills: [{ name: 'Python', optional: true }] },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [secondAd, secondRevision],
    )
    await changeCompanyLink(pool, company.id, link('publisher'))
    await changeCompanyLink(pool, company.id, {
      ...link('client'),
      adId: secondAd,
    })
    const detail = await readCompany(pool, company.id)
    expect(detail!.offers.find((o) => o.id === adId)).toMatchObject({
      roles: ['publisher'],
      skills: [{ name: 'PHP' }, { name: 'Vue' }, { name: 'Mystery' }],
    })
    expect(detail!.offers.find((o) => o.id === secondAd)).toMatchObject({
      roles: ['client'],
      skills: [{ name: 'Python', optional: true }],
    })
    expect(detail!.technologies.filter((t) => t.adId === secondAd)).toEqual([
      expect.objectContaining({
        name: 'Python',
        optional: true,
        roles: ['client'],
      }),
    ])
    expect(
      detail!.technologies.filter((t) => t.adId === adId).map((t) => t.name),
    ).not.toContain('Python')
  })
  it('keeps historical revision evidence across content updates, unlink and receipt replay', async () => {
    const company = await create(),
      command = link()
    await changeCompanyLink(pool, company.id, command)
    expect(await changeCompanyLink(pool, company.id, command)).toEqual(company)
    await expect(
      changeCompanyLink(pool, company.id, {
        ...command,
        evidence: 'Changed evidence',
      }),
    ).rejects.toBeInstanceOf(CompanyConflict)
    const next = randomUUID()
    await pool.query(
      'INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,$3,$4)',
      [
        next,
        adId,
        randomUUID(),
        {
          title: 'New role',
          company: 'Different source company',
          skills: [{ name: 'Go', optional: false }],
        },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [adId, next],
    )
    const changed = await readCompany(pool, company.id)
    expect(changed!.offers[0]!.title).toBe('New role')
    expect(changed!.technologies[0]!.name).toBe('Go')
    expect(changed!.history[0]).toMatchObject({
      revisionId,
      title: 'PHP role',
      action: 'link',
    })
    const unlink = link('employer', company.id, 'unlink')
    await changeCompanyLink(pool, company.id, unlink)
    await changeCompanyLink(pool, company.id, unlink)
    await expect(
      changeCompanyLink(pool, company.id, {
        ...unlink,
        evidence: 'Changed unlink evidence',
      }),
    ).rejects.toBeInstanceOf(CompanyConflict)
    const detail = await readCompany(pool, company.id)
    expect(detail!.offers).toEqual([])
    expect(detail!.technologies).toEqual([])
    expect(detail!.history).toHaveLength(2)
    expect(detail!.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          revisionId: next,
          title: 'New role',
          action: 'unlink',
        }),
        expect.objectContaining({ revisionId, action: 'link' }),
      ]),
    )
    expect(await readOffer(adId)).toMatchObject({ title: 'New role' })
  })
  it('rejects nonexistent targets and invalid commands without receipts or history', async () => {
    const company = await create()
    await expect(
      changeCompanyLink(pool, randomUUID(), link()),
    ).rejects.toBeInstanceOf(CompanyNotFound)
    await expect(
      changeCompanyLink(pool, company.id, { ...link(), adId: randomUUID() }),
    ).rejects.toBeInstanceOf(CompanyNotFound)
    await expect(
      changeCompanyLink(pool, company.id, { ...link(), role: 'invented' }),
    ).rejects.toThrow()
    expect(await readCompany(pool, "' OR 1=1 --")).toBeNull()
    expect(await offerCompanies(pool, randomUUID())).toBeNull()
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM company_commands'))
        .rows[0].count,
    ).toBe(1)
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM company_link_history',
        )
      ).rows[0].count,
    ).toBe(0)
  })
  it('searches literal owner text and provides stable sorted pages of 25', async () => {
    for (let n = 0; n < 27; n++)
      await create(`Company ${String(n).padStart(2, '0')}`)
    expect((await listCompanies(pool)).items.map((c) => c.name)).toEqual(
      Array.from(
        { length: 25 },
        (_, n) => `Company ${String(n).padStart(2, '0')}`,
      ),
    )
    expect(await listCompanies(pool, { page: 999 })).toMatchObject({
      page: 2,
      pageSize: 25,
      total: 27,
      items: [{ name: 'Company 25' }, { name: 'Company 26' }],
    })
    expect((await listCompanies(pool, { q: 'company 26' })).total).toBe(1)
    expect((await listCompanies(pool, { q: 'OWNER EVIDENCE' })).total).toBe(27)
    expect((await listCompanies(pool, { q: '%' })).total).toBe(0)
    await pool.query("UPDATE companies SET created_at='2026-01-01'")
    await pool.query(
      "UPDATE companies SET created_at='2026-02-01' WHERE name='Company 26'",
    )
    expect((await listCompanies(pool, { sort: 'newest' })).items[0]!.name).toBe(
      'Company 26',
    )
  })
  describe('title and company name in the unified form of the Sources read (A6-R07)', () => {
    /** Makes a new version with the given title and company current. */
    async function changeAd(title: unknown, company: unknown) {
      const version = randomUUID()
      await pool.query(
        'INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,$3,$4)',
        [version, adId, randomUUID(), { title, company }],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [adId, version],
      )
    }
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['not text', 42],
      ['absent', undefined],
      ['the fixed text of a missing title', 'Stanowisko bez nazwy'],
    ])(
      'shows a version with a missing title (%s) as "Oferta" in the link history',
      async (_case, title) => {
        await changeAd(title, 'Same name')
        const company = await create()
        await changeCompanyLink(pool, company.id, link())
        const detail = await readCompany(pool, company.id)
        expect(detail!.history[0]!.title).toBe('Oferta')
      },
    )
    it('ignores spaces at the ends of a title in the link history', async () => {
      await changeAd('  PHP role  ', 'Same name')
      const company = await create()
      await changeCompanyLink(pool, company.id, link())
      expect((await readCompany(pool, company.id))!.history[0]!.title).toBe(
        'PHP role',
      )
    })
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['not text', 42],
      ['absent', undefined],
      ['the fixed text of a missing company', 'Firma niepodana'],
    ])(
      'suggests no company profile for an ad with a missing company name (%s)',
      async (_case, name) => {
        await changeAd('PHP role', name)
        await create('Firma niepodana')
        await create('42')
        expect(await offerCompanies(pool, adId)).toEqual({
          name: null,
          links: [],
          suggestions: [],
        })
      },
    )
    it('suggests a profile whose name differs from the ad company only by spaces at the ends', async () => {
      await changeAd('PHP role', '  Same name  ')
      const company = await create('Same name')
      const offer = await offerCompanies(pool, adId)
      expect(offer!.name).toBe('Same name')
      expect(offer!.suggestions.map((s) => s.id)).toEqual([company.id])
    })
  })
})

function http(
  path: string,
  method = 'GET',
  body?: unknown,
  origin?: string,
): Promise<{
  status: number | undefined
  body: string
  cache: string | undefined
}> {
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
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            body: text,
            cache: response.headers['cache-control'],
          }),
        )
        response.on('error', reject)
      },
    )
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')))
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
integration(
  'company HTTP reads and rejected writes without live fixture creation',
  () => {
    it('reads lists and rejects invalid queries and missing profiles', async () => {
      const result = await http('/api/companies')
      expect(result.status).toBe(200)
      expect(result.cache).toContain('no-store')
      expect(JSON.parse(result.body)).toMatchObject({ pageSize: 25 })
      expect(JSON.parse(result.body).items.length).toBeLessThanOrEqual(25)
      expect((await http('/api/companies?page=0')).status).toBe(422)
      expect((await http('/api/companies/not-a-uuid')).status).toBe(404)
      expect((await http('/api/offers/not-a-uuid/companies')).status).toBe(404)
      const page = await http('/companies')
      expect(page.status).toBe(200)
      expect(page.body).toContain('Firmy')
      expect(page.body).not.toContain('Hasło właściciela')
    })
    it('rejects cross-origin and invalid commands before any live write', async () => {
      expect(
        (await http('/api/companies', 'POST', {}, 'https://untrusted.example'))
          .status,
      ).toBe(403)
      expect((await http('/api/companies', 'POST', {})).status).toBe(403)
      expect(
        (await http('/api/companies', 'POST', {}, 'http://localhost')).status,
      ).toBe(422)
      expect(
        (
          await http(
            `/api/companies/${randomUUID()}/links`,
            'POST',
            {},
            'http://localhost',
          )
        ).status,
      ).toBe(422)
    })
  },
)
