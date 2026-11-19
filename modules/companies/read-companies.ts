import { z } from 'zod'
import {
  missingAdCompany,
  missingAdTitle,
  readAdVersions,
  readCurrentAds,
  type SourceAd,
} from '../sources/index.ts'
import type { CompanyRole } from './domain/company.ts'
import {
  adCompanyLinks,
  companiesNamed,
  companiesWithOfferCounts,
  companyLinkHistory,
  companyLinks,
  readCompanyRow,
} from './infrastructure/persistence/companies.ts'

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
export const companyFilters = z
  .object({
    q: z.string().trim().max(300).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    sort: z.enum(['name', 'newest', 'offers']).default('name'),
  })
  .strict()
export async function listCompanies(value: unknown = {}) {
  const filters = companyFilters.parse(value)
  const rows = (await companiesWithOfferCounts()).filter((row) =>
    `${row.name} ${row.description}`
      .toLocaleLowerCase('pl')
      .includes(filters.q.toLocaleLowerCase('pl')),
  )
  rows.sort(
    (a, b) =>
      (filters.sort === 'offers'
        ? (b.offer_count as number) - (a.offer_count as number)
        : filters.sort === 'newest'
          ? new Date(b.created_at as Date).getTime() -
            new Date(a.created_at as Date).getTime()
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
export async function readCompany(id: string) {
  if (!uuid.safeParse(id).success) return null
  const row = await readCompanyRow(id)
  if (!row) return null
  const links = await companyLinks(id)
  const ads = new Map(
    (await readCurrentAds(links.map((link) => link.ad_id))).map((ad) => [
      ad.id,
      ad,
    ]),
  )
  const offers = new Map<
    string,
    Omit<SourceAd, 'versionId'> & { revisions: never[]; roles: CompanyRole[] }
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
      // The response keeps the empty version history it always had.
      offers.set(ad.id, { ...content, revisions: [], roles: [] })
    }
    offers.get(ad.id)!.roles.push(link.role)
  }
  const historyRows = await companyLinkHistory(id)
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
        at: iso(h.created_at as Date),
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
export async function offerCompanies(id: string) {
  if (!uuid.safeParse(id).success) return null
  const [ad] = await readCurrentAds([id])
  if (!ad) return null
  // An ad without a company name suggests no company profile.
  const name = ad.company === missingAdCompany ? null : ad.company
  const links = await adCompanyLinks(id)
  const suggestions = name === null ? [] : await companiesNamed(name)
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
