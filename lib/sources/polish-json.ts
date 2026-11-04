import type { PolishQuery } from './polish.ts'
import { polishCatalog } from './polish-catalog.ts'
import type { Offer } from './solid.ts'

type Raw = Record<string, unknown>
const object = (v: unknown): Raw =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {}
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null
const names = (v: unknown, field = 'name') =>
  array(v).flatMap((x) =>
    text(object(x)[field]) ? [text(object(x)[field])!] : [],
  )
const amount = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const date = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
    return Number.isFinite(new Date(v).getTime())
      ? new Date(v).toISOString()
      : null
  const s = text(v)
  return s && /(Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s))
    ? new Date(s).toISOString()
    : null
}
const period = (v: unknown) =>
  ({ hour: 'Hour', month: 'Month', year: 'Year', week: 'Week', day: 'Day' })[
    String(v).toLowerCase() as 'hour'
  ] ?? null
const contract = (v: string) =>
  ({
    b2b: 'B2B',
    b2b_contract: 'B2B',
    permanent: 'UoP',
    employment: 'UoP',
    uop: 'UoP',
  })[v as 'b2b'] ?? v
function pay(
  from: unknown,
  to: unknown,
  currency: unknown,
  unit: unknown,
  type: string,
  basis: string | null = null,
) {
  const lo = amount(from),
    hi = amount(to)
  if ((lo === null && hi === null) || (lo !== null && hi !== null && lo > hi))
    return null
  return {
    from: lo,
    to: hi,
    currency: text(currency)?.toUpperCase() ?? null,
    period: period(unit),
    employmentType: contract(type),
    origin: 'employer',
    basis,
  }
}
export function normalizeJsonSource(
  source: 'justjoinit' | 'nofluffjobs',
  record: { url: string; listing: Raw; detail: Raw },
  query: PolishQuery,
): Offer {
  const l = record.listing,
    d = record.detail,
    jj = source === 'justjoinit'
  const identity = text(d.id),
    listed = text(jj ? l.guid : l.id)
  const listReference = text(l.reference),
    detailReference = text(d.reference)
  const sameIdentity = jj
    ? identity === listed
    : listReference && detailReference
      ? listReference === detailReference
      : identity?.toLowerCase() === listed?.toLowerCase()
  if (!identity || !listed || !sameIdentity)
    throw new Error('Invalid Polish source record')
  const url = new URL(record.url)
  const slug = jj
    ? text(l.slug)
    : (text(d.defaultUrl) ?? text(d.postingUrl) ?? identity)
  if (
    !slug ||
    url.protocol !== 'https:' ||
    url.hostname !== polishCatalog[source].host ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.search ||
    decodeURIComponent(url.pathname) !==
      `${jj ? '/job-offer/' : '/pl/job/'}${slug}`
  )
    throw new Error('Invalid Polish source record')
  const title = text(d.title) ?? text(l.title)
  if (!title) throw new Error('Invalid Polish source record')
  const basics = object(d.basics),
    requirements = object(d.requirements),
    location = object(d.location)
  const skills = jj
    ? [
        ...names(d.requiredSkills).map((name) => ({ name, optional: false })),
        ...names(d.niceToHaveSkills).map((name) => ({ name, optional: true })),
      ]
    : [
        ...names(requirements.musts, 'value').map((name) => ({
          name,
          optional: false,
        })),
        ...names(requirements.nices, 'value').map((name) => ({
          name,
          optional: true,
        })),
      ]
  const level = jj ? d.experienceLevel : (basics.seniority ?? l.seniority)
  const levels = (Array.isArray(level) ? level : [level]).flatMap((v) =>
    text(v) ? [text(v)!.toLowerCase()] : [],
  )
  const sections = jj
    ? [text(d.body)]
    : [
        text(object(d.details).description),
        text(requirements.description),
        ...array(object(d.specs).dailyTasks).map(text),
        ...array(object(d.recruitment).processSteps).map(text),
      ]
  const description = sections.filter(Boolean).join('\n\n') || null
  const original = object(object(d.essentials).originalSalary)
  const hidden =
    ['HIDDEN', 'NOT_VISIBLE'].includes(String(original.disclosedAt)) ||
    ['HIDDEN', 'NOT_VISIBLE'].includes(String(original.containsSalary))
  const salaries = jj
    ? array(d.employmentTypes).flatMap((value) => {
        const s = object(value)
        if (s.currencySource !== 'original') return []
        const result = pay(
          s.fromPerUnit ?? s.from,
          s.toPerUnit ?? s.to,
          s.currency,
          s.unit,
          text(s.type) ?? 'unknown',
          typeof s.gross === 'boolean' ? (s.gross ? 'brutto' : 'netto') : null,
        )
        return result ? [result] : []
      })
    : hidden
      ? []
      : Object.entries(object(original.types)).flatMap(([kind, value]) => {
          const s = object(value),
            range = array(s.range)
          const result = pay(
            range[0],
            range[1],
            original.currency,
            s.period,
            kind,
          )
          return result ? [result] : []
        })
  const workplace = jj
    ? (text(d.workplaceType) ?? text(l.workplaceType))
    : text(object(l.location).type)
  const remote = workplace === 'remote',
    hybrid = workplace === 'hybrid',
    office = workplace === 'office' || workplace === 'stationary'
  const locations = jj
    ? [
        ...new Set([
          ...names(d.locations, 'city'),
          ...(text(d.city) ? [text(d.city)!] : []),
        ]),
      ]
    : [
        ...new Set(
          array(location.places).flatMap((p) => {
            const v = object(p),
              city = text(v.city),
              country = text(object(v.country).name)
            return city ? [[city, country].filter(Boolean).join(', ')] : []
          }),
        ),
      ]
  const qualificationUnknown: string[] = []
  if (
    query.seniority &&
    (!levels.length ||
      levels.some(
        (v) =>
          ![
            'intern',
            'junior',
            'mid',
            'senior',
            'expert',
            'lead',
            'staff',
            'principal',
            'manager',
            'c_level',
          ].includes(v),
      ))
  )
    qualificationUnknown.push(query.seniority)
  const primaryTechnology = jj
    ? text(object(d.category).key)
    : text(basics.technology)
  if (
    query.technology &&
    ![primaryTechnology, ...skills.map((s) => s.name)].some(
      (v) => v?.toLowerCase() === query.technology!.toLowerCase(),
    )
  )
    qualificationUnknown.push(query.technology)
  return {
    jobOfferKey: jj ? identity : (text(d.defaultUrl) ?? identity).toLowerCase(),
    url: record.url,
    title,
    company: jj
      ? (text(d.companyName) ?? text(l.companyName))
      : (text(object(d.company).name) ?? text(l.name)),
    description,
    locations,
    skills,
    salaries,
    experienceLevel: levels.join(', ') || null,
    contractTime: jj ? text(d.workingTime) : null,
    isRemote: remote ? true : hybrid || office ? false : null,
    isHybrid: hybrid ? true : remote || office ? false : null,
    validFrom: date(jj ? d.publishedAt : d.posted),
    validTo: date(jj ? d.expiredAt : d.expiresAt),
    sourceUpdatedAt: jj ? date(l.lastPublishedAt) : null,
    sourceActive: jj
      ? (d.isActive ?? null)
      : d.status === 'PUBLISHED'
        ? true
        : null,
    qualificationUnknown,
    sourceRecord: { listing: l, detail: d },
  }
}
