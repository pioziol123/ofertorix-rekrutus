import { assessRemoteEligibility } from './remote-eligibility.ts'
import { polishCatalog, type PolishSource } from './polish-catalog.ts'
import { jobspyCatalog, type JobspySource } from './jobspy-catalog.ts'
import {
  missingAdCompany,
  missingAdTitle,
  type Salary,
  type SourceAdContent,
} from '../source-ad.ts'

// Translates a stored ad and the content of one of its versions, saved in
// the source's own form, into the unified form of the Sources read.
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(text).filter((s): s is string => s !== null) : []
const date = (v: unknown): string | null =>
  (typeof v === 'string' || v instanceof Date) &&
  Number.isFinite(new Date(v).getTime())
    ? new Date(v).toISOString()
    : null
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const url = new URL(v)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
export function plainDescription(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/(p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({
          '&nbsp;': ' ',
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&#39;': "'",
        })[entity]!,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
export function projectSourceAd(
  row: Record<string, unknown>,
  now = new Date(),
): SourceAdContent {
  const p =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Record<string, unknown>)
      : {}
  const salaries: Salary[] = []
  for (const value of Array.isArray(p.salaries)
    ? p.salaries
    : [p.salary, p.secondarySalary]) {
    if (value && typeof value === 'object') {
      const s = value as Record<string, unknown>
      salaries.push({
        from: number(s.from),
        to: number(s.to),
        currency: text(s.currency),
        period: text(s.period),
        contract: text(s.employmentType),
        ...(text(s.basis) ? { basis: text(s.basis) } : {}),
        ...(['employer', 'portal_estimate', 'unknown'].includes(
          String(s.origin),
        )
          ? { origin: s.origin as Salary['origin'] }
          : {}),
      })
    }
  }
  const skills = Array.isArray(p.skills)
    ? p.skills.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const skill = value as Record<string, unknown>
        const name = text(skill.name)
        return name
          ? [
              {
                name,
                optional:
                  typeof skill.optional === 'boolean'
                    ? skill.optional
                    : skill.level === 'NiceToHave'
                      ? true
                      : ['Basic', 'Advanced', 'Expert'].includes(
                            String(skill.level),
                          )
                        ? false
                        : null,
              },
            ]
          : []
      })
    : []
  const validTo = date(row.valid_to)
  return {
    id: String(row.id),
    title: text(p.title) ?? missingAdTitle,
    company: text(p.company) ?? missingAdCompany,
    url: safeUrl(row.url),
    description: plainDescription(p.description),
    salaries,
    skills,
    locations: strings(p.locations),
    seniority: text(p.experienceLevel),
    hours: text(p.contractTime),
    mode:
      p.isRemote === true && p.isHybrid === true
        ? 'remote-hybrid'
        : p.isRemote === true
          ? 'remote'
          : p.isHybrid === true
            ? 'hybrid'
            : p.isRemote === false && p.isHybrid === false
              ? 'office'
              : null,
    firstSeen: date(row.first_seen_at)!,
    lastSeen: date(row.last_seen_at)!,
    published: date(p.validFrom),
    validTo,
    availability:
      row.availability === 'unavailable' ? 'unavailable' : 'available',
    expired: validTo !== null && new Date(validTo) < now,
    ...(typeof row.source === 'string' &&
    (Object.hasOwn(jobspyCatalog, row.source) ||
      Object.hasOwn(polishCatalog, row.source) ||
      row.source === 'himalayas')
      ? {
          source:
            row.source === 'himalayas'
              ? 'Himalayas'
              : Object.hasOwn(polishCatalog, row.source)
                ? polishCatalog[row.source as PolishSource].name
                : jobspyCatalog[row.source as JobspySource].name,
          qualificationUnknown: strings(p.qualificationUnknown),
          remoteEligibility: assessRemoteEligibility(
            p.sourceRecord && typeof p.sourceRecord === 'object'
              ? (p.sourceRecord as Record<string, unknown>)
              : {
                  title: p.title,
                  description: p.description,
                  is_remote: p.isRemote,
                },
          ),
        }
      : {}),
  }
}
