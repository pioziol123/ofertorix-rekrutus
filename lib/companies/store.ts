import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  createCompanyCommand,
  companyLinkCommand,
  type CompanyRole,
} from './model.ts'
import {
  missingAdCompany,
  missingAdTitle,
  readAdVersions,
  readCurrentAds,
  readCurrentAdVersions,
  type SourceAd,
} from '../../modules/sources/index.ts'
export class CompanyConflict extends Error {}
export class CompanyNotFound extends Error {}
const uuid = z.uuid()
type Company = {
  id: string
  name: string
  kind: 'organization' | 'brand' | 'unknown'
  website: string | null
  description: string
  created_at: string
}
const iso = (value: Date | string) => new Date(value).toISOString()
const profile = (row: Record<string, unknown>): Company => ({
  id: String(row.id),
  name: String(row.name),
  kind: row.kind as Company['kind'],
  website: row.website as string | null,
  description: String(row.description),
  created_at: iso(row.created_at as Date),
})
async function command(
  pool: Pool,
  id: string,
  input: unknown,
  run: (client: PoolClient) => Promise<{ id: string }>,
) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `company-command-${id}`,
    ])
    const existing = (
      await client.query('SELECT * FROM company_commands WHERE id=$1', [id])
    ).rows[0]
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new CompanyConflict()
      await client.query('COMMIT')
      return existing.result as { id: string }
    }
    const result = await run(client)
    await client.query(
      'INSERT INTO company_commands(id,fingerprint,result) VALUES($1,$2,$3)',
      [id, fingerprint, result],
    )
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
export async function createCompany(pool: Pool, value: unknown) {
  const input = createCompanyCommand.parse(value)
  return command(
    pool,
    input.commandId,
    { operation: 'create', ...input },
    async (client) => {
      const id = randomUUID()
      await client.query(
        'INSERT INTO companies(id,name,kind,website,description) VALUES($1,$2,$3,$4,$5)',
        [id, input.name, input.kind, input.website, input.description],
      )
      return { id }
    },
  )
}
export async function changeCompanyLink(
  pool: Pool,
  companyId: string,
  value: unknown,
) {
  if (!uuid.safeParse(companyId).success) throw new CompanyNotFound()
  companyId = companyId.toLowerCase()
  const input = companyLinkCommand.parse(value)
  // The version linked is the one read here, before the command holds its
  // connection and without a row lock: an ad that changes before the write
  // keeps the link on the version read (A6-R05, accepted as for matching).
  const [adVersion] = await readCurrentAdVersions([input.adId])
  return command(
    pool,
    input.commandId,
    { operation: 'link', companyId, ...input },
    async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `company-ad-${input.adId}`,
      ])
      if (
        !(
          await client.query('SELECT id FROM companies WHERE id=$1', [
            companyId,
          ])
        ).rowCount
      )
        throw new CompanyNotFound()
      if (!adVersion) throw new CompanyNotFound()
      const current =
        (
          await client.query(
            'SELECT company_id FROM company_ad_links WHERE ad_id=$1 AND role=$2',
            [input.adId, input.role],
          )
        ).rows[0]?.company_id ?? null
      if (
        current !== input.expectedCompanyId ||
        (input.action === 'unlink' && current !== companyId)
      )
        throw new CompanyConflict()
      if (input.action === 'link') {
        if (current !== null) throw new CompanyConflict()
        await client.query(
          'INSERT INTO company_ad_links(ad_id,role,company_id,evidence,revision_id) VALUES($1,$2,$3,$4,$5)',
          [
            input.adId,
            input.role,
            companyId,
            input.evidence,
            adVersion.versionId,
          ],
        )
      } else
        await client.query(
          'DELETE FROM company_ad_links WHERE ad_id=$1 AND role=$2',
          [input.adId, input.role],
        )
      await client.query(
        'INSERT INTO company_link_history(id,ad_id,role,company_id,action,evidence,revision_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          input.adId,
          input.role,
          companyId,
          input.action,
          input.evidence,
          adVersion.versionId,
        ],
      )
      return { id: companyId }
    },
  )
}
export const companyFilters = z
  .object({
    q: z.string().trim().max(300).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    sort: z.enum(['name', 'newest', 'offers']).default('name'),
  })
  .strict()
export async function listCompanies(pool: Pool, value: unknown = {}) {
  const filters = companyFilters.parse(value)
  const rows = (
    await pool.query(
      `SELECT c.*,count(DISTINCT l.ad_id)::int AS offer_count FROM companies c LEFT JOIN company_ad_links l ON l.company_id=c.id GROUP BY c.id`,
    )
  ).rows.filter((row) =>
    `${row.name} ${row.description}`
      .toLocaleLowerCase('pl')
      .includes(filters.q.toLocaleLowerCase('pl')),
  )
  rows.sort(
    (a, b) =>
      (filters.sort === 'offers'
        ? b.offer_count - a.offer_count
        : filters.sort === 'newest'
          ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          : 0) ||
      String(a.name).localeCompare(String(b.name), 'pl') ||
      String(a.id).localeCompare(String(b.id)),
  )
  const page = Math.min(filters.page, Math.max(1, Math.ceil(rows.length / 25)))
  return {
    items: rows.slice((page - 1) * 25, page * 25).map((row) => ({
      ...profile(row),
      offerCount: row.offer_count as number,
    })),
    total: rows.length,
    page,
    pageSize: 25,
  }
}
// Ads linked to a company, newest first by first observation, as listed
// before the read moved to the Sources module.
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const byFirstSeenDesc = (a?: SourceAd, b?: SourceAd) =>
  compare(b?.firstSeen ?? '', a?.firstSeen ?? '')
export async function readCompany(pool: Pool, id: string) {
  if (!uuid.safeParse(id).success) return null
  const row = (await pool.query('SELECT * FROM companies WHERE id=$1', [id]))
    .rows[0]
  if (!row) return null
  const links = (
    await pool.query<{ ad_id: string; role: CompanyRole }>(
      'SELECT ad_id,role FROM company_ad_links WHERE company_id=$1 ORDER BY role',
      [id],
    )
  ).rows
  const ads = new Map(
    (await readCurrentAds(links.map((link) => link.ad_id))).map((ad) => [
      ad.id,
      ad,
    ]),
  )
  const offers = new Map<
    string,
    Omit<SourceAd, 'versionId'> & { roles: CompanyRole[] }
  >()
  for (const link of [...links].sort(
    (a, b) =>
      byFirstSeenDesc(ads.get(a.ad_id), ads.get(b.ad_id)) ||
      compare(a.ad_id, b.ad_id),
  )) {
    const ad = ads.get(link.ad_id)
    if (!ad) continue
    if (!offers.has(ad.id)) {
      const { versionId: _current, ...content } = ad
      offers.set(ad.id, { ...content, roles: [] })
    }
    offers.get(ad.id)!.roles.push(link.role)
  }
  const historyRows = (
    await pool.query(
      'SELECT * FROM company_link_history WHERE company_id=$1 ORDER BY created_at DESC,id DESC',
      [id],
    )
  ).rows
  const versions = new Map(
    (await readAdVersions(historyRows.map((h) => String(h.revision_id)))).map(
      (version) => [version.versionId, version],
    ),
  )
  const history = historyRows.flatMap((h) => {
    const version = versions.get(String(h.revision_id))
    if (!version) return []
    return [
      {
        id: String(h.id),
        adId: String(h.ad_id),
        role: h.role as CompanyRole,
        action: h.action as 'link' | 'unlink',
        evidence: String(h.evidence),
        revisionId: String(h.revision_id),
        // An ad version without a title shows under a label of its own.
        title: version.title === missingAdTitle ? 'Oferta' : version.title,
        at: iso(h.created_at),
      },
    ]
  })
  return {
    ...profile(row),
    offers: [...offers.values()],
    technologies: [...offers.values()].flatMap((offer) =>
      offer.skills.map((skill) => ({
        ...skill,
        adId: offer.id,
        title: offer.title,
        url: offer.url,
        roles: offer.roles,
      })),
    ),
    history,
  }
}
export async function offerCompanies(pool: Pool, id: string) {
  if (!uuid.safeParse(id).success) return null
  const [ad] = await readCurrentAds([id])
  if (!ad) return null
  // An ad without a company name suggests no company profile.
  const name = ad.company === missingAdCompany ? null : ad.company
  const links = (
    await pool.query(
      `SELECT l.role,l.evidence,c.id,c.name,c.kind FROM company_ad_links l JOIN companies c ON c.id=l.company_id WHERE l.ad_id=$1`,
      [id],
    )
  ).rows
  const suggestions =
    name === null
      ? []
      : (
          await pool.query(
            `SELECT id,name,kind FROM companies WHERE lower(name)=lower($1) ORDER BY created_at,id LIMIT 20`,
            [name],
          )
        ).rows
  return {
    name,
    links: links.map((l) => ({
      role: l.role as CompanyRole,
      evidence: String(l.evidence),
      id: String(l.id),
      name: String(l.name),
      kind: l.kind as Company['kind'],
    })),
    suggestions: suggestions.map((c) => ({
      id: String(c.id),
      name: String(c.name),
      kind: c.kind as Company['kind'],
    })),
  }
}
