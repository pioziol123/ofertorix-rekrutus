import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { z } from 'zod'
import { hash, type Offer } from './solid.ts'
import { normalizeJsonSource } from './polish-json.ts'

import {
  polishCatalog,
  polishSources,
  type PolishSource,
} from './polish-catalog.ts'
export {
  polishCatalog,
  polishSources,
  type PolishSource,
} from './polish-catalog.ts'
export const sourceSchema = z.enum(polishSources)
export const polishQuery = z
  .object({
    source: sourceSchema,
    technology: z.string().trim().min(1).max(80).nullable().default('PHP'),
    seniority: z
      .enum(['junior', 'mid', 'senior', 'expert', 'lead', 'staff', 'principal'])
      .nullable()
      .default('senior'),
    maxOffers: z.number().int().min(1).max(200).default(50),
    maxPages: z.number().int().min(1).max(100).default(5),
    maxRequests: z.number().int().min(1).max(250).default(60),
    maxSeconds: z.number().int().min(1).max(150).default(150),
  })
  .strict()
export type PolishQuery = z.output<typeof polishQuery>
export const polishQueue = (source: PolishSource) => `source-${source}-polish`
export const polishParameters = (query: PolishQuery) => ({
  adapterVersion: 1,
  query,
})
export const polishEnabled = (source: PolishSource) =>
  (process.env.POLISH_SOURCES ?? polishSources.join(','))
    .split(',')
    .map((s) => s.trim())
    .includes(source)

const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const strings = (value: unknown) =>
  arr(value).flatMap((v) => (text(v) ? [text(v)!] : []))
const date = (value: unknown) => {
  const s = text(value)
  if (!s || !/(Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s)))
    return null
  return new Date(s).toISOString()
}
const amount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
const period = (value: unknown) =>
  ({
    hour: 'Hour',
    hourly: 'Hour',
    godzina: 'Hour',
    godzinowo: 'Hour',
    month: 'Month',
    monthly: 'Month',
    miesięcznie: 'Month',
    year: 'Year',
    yearly: 'Year',
    annually: 'Year',
  })[String(value).toLowerCase() as 'hour'] ?? null
const currency = (value: unknown) =>
  ({
    zł: 'PLN',
    PLN: 'PLN',
    EUR: 'EUR',
    '€': 'EUR',
    USD: 'USD',
    $: 'USD',
    GBP: 'GBP',
    '£': 'GBP',
  })[String(value) as 'PLN'] ?? text(value)
function contractName(value: unknown): string | null {
  const name = text(value)
  if (!name) return null
  if (['b2b', 'b2b contract', 'kontrakt b2b'].includes(name.toLowerCase()))
    return 'B2B'
  if (
    ['contract of employment', 'employment contract', 'umowa o pracę'].includes(
      name.toLowerCase(),
    )
  )
    return 'UoP'
  return name
}
function salary(value: unknown, contract: string | null) {
  const s = obj(value)
  if (s.hidden === true) return null
  let from = amount(s.minValue ?? s.from),
    to = amount(s.maxValue ?? s.to)
  if (from === null && to === null && typeof s.money === 'string') {
    const match = s.money
      .replace(/[\s\u00a0]/g, '')
      .match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/)
    if (match) {
      from = Number(match[1]!.replace(',', '.'))
      to = Number(match[2]!.replace(',', '.'))
    }
  }
  if (from === null && to === null) return null
  if (from !== null && to !== null && from > to) return null
  return {
    from,
    to,
    currency: currency(s.currency ?? s.currencySymbol ?? s.currencyCode),
    period: period(s.timeframe ?? obj(s.timeUnit).longForm),
    employmentType: contractName(contract),
    origin: 'employer',
    basis: text(s.kindName ?? s.kindCode),
  }
}

function normalize(
  source: PolishSource,
  record: {
    url: string
    listing: Record<string, unknown>
    detail: Record<string, unknown>
  },
  query: PolishQuery,
): Offer {
  if (source === 'justjoinit' || source === 'nofluffjobs')
    return normalizeJsonSource(source, record, query)
  const l = record.listing,
    d = record.detail
  const a = obj(d.attributes),
    employment = obj(a.employment),
    publication = obj(d.publicationDetails)
  const isBulldog = source === 'bulldogjob'
  const company = isBulldog
    ? (text(obj(d.company).name) ?? text(obj(l.company).name))
    : (text(obj(a.employer).name) ?? text(l.employer))
  const title = isBulldog
    ? (text(d.position) ?? text(l.position))
    : (text(obj(a.title).value) ?? text(l.title))
  if (!title || !text(d.id) || d.id !== l.id)
    throw new Error('Invalid Polish source record')
  const url = new URL(record.url)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== polishCatalog[source].host ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid Polish source record')
  if (
    isBulldog
      ? !/^\/companies\/jobs\/\d+-[^/]+$/.test(url.pathname) ||
        decodeURIComponent(url.pathname.split('/').at(-1)!) !== d.id
      : !url.pathname.startsWith('/praca/') ||
        !decodeURIComponent(url.pathname).endsWith(`,oferta,${String(d.id)}`)
  )
    throw new Error('Invalid Polish source record')
  const sections = isBulldog
    ? [d.details, d.offer, d.requirements, d.recruitmentProcess].filter(
        (v) => typeof v === 'string',
      )
    : arr(d.textSections)
        .map((s) => text(obj(s).plainText))
        .filter(Boolean)
  const description = sections.join('\n\n') || null
  const levels = isBulldog
    ? [text(d.experienceLevel) ?? text(l.experienceLevel)].filter(Boolean)
    : strings(employment.positionLevelIds).length
      ? strings(employment.positionLevelIds)
      : arr(l.positionLevels)
          .map((s) => text(obj(s).value))
          .filter(Boolean)
  const skills = isBulldog
    ? [
        ...new Set(
          [text(d.mainTechnology), ...strings(d.technologyTags)].filter(
            (s): s is string => !!s,
          ),
        ),
      ].map((name) => ({ name }))
    : [
        ...arr(obj(d.technologies).expected).flatMap((s) =>
          text(obj(s).name)
            ? [{ name: text(obj(s).name)!, optional: false }]
            : [],
        ),
        ...arr(obj(d.technologies).optional).flatMap((s) =>
          text(obj(s).name)
            ? [{ name: text(obj(s).name)!, optional: true }]
            : [],
        ),
      ]
  const modes = isBulldog
    ? strings(d.workModes)
    : arr(employment.detailedWorkModes)
        .map((m) => text(obj(m).code))
        .filter((s): s is string => !!s)
  const remote = modes.some((m) =>
      ['full-remote', 'remote', 'home-office'].includes(m),
    ),
    hybrid = modes.includes('hybrid')
  const office = modes.some((m) =>
    ['office', 'stationary', 'full-office', 'on-site'].includes(m),
  )
  const salaries = isBulldog
    ? [
        salary(d.b2bSalary, 'B2B'),
        salary(d.employmentSalary, 'UoP'),
        salary(d.otherSalary, null),
      ].filter((s) => s !== null)
    : arr(employment.typesOfContracts)
        .map((c) => salary(obj(c).salary, text(obj(c).name)))
        .filter((s) => s !== null)
  const locations = isBulldog
    ? [
        ...new Set([
          ...arr(d.locations)
            .map((v) =>
              typeof v === 'string'
                ? v
                : (text(obj(v).city) ?? text(obj(v).name)),
            )
            .filter((s): s is string => !!s),
          ...strings(d.workFrom),
          ...(!arr(d.locations).length && text(l.city) ? [text(l.city)!] : []),
        ]),
      ]
    : arr(a.workplaces).flatMap((v) =>
        text(obj(v).location) ? [text(obj(v).location)!] : [],
      )
  const unknown = []
  if (
    query.seniority &&
    (!levels.length ||
      levels.some(
        (level) =>
          ![
            'junior',
            'mid',
            'senior',
            'expert',
            'lead',
            'staff',
            'principal',
          ].includes(String(level).toLowerCase()),
      ))
  )
    unknown.push(query.seniority)
  if (
    query.technology &&
    !skills.some(
      (s) => s.name.toLowerCase() === query.technology!.toLowerCase(),
    )
  )
    unknown.push(query.technology)
  return {
    jobOfferKey: String(d.id),
    url: record.url,
    title,
    company,
    description,
    locations,
    experienceLevel: levels.join(', ') || null,
    contractTime: isBulldog
      ? text(d.employmentType)
      : strings(employment.workScheduleIds).join(', ') || null,
    isRemote: remote ? true : hybrid || office ? false : null,
    isHybrid: hybrid ? true : remote || office ? false : null,
    skills,
    salaries,
    validFrom: date(
      isBulldog ? d.publishedAt : publication.dateOfInitialPublicationUtc,
    ),
    validTo: date(isBulldog ? d.endsAt : publication.archivizationDateUtc),
    sourceUpdatedAt: date(
      isBulldog ? d.publishedAt : publication.lastPublishedUtc,
    ),
    sourceActive: isBulldog
      ? d.state === 'published'
      : (publication.isActive ?? publication.active ?? null),
    qualificationUnknown: unknown,
    sourceRecord: { listing: l, detail: d },
  }
}
const count = z.number().int().nonnegative().max(1_000_000)
const resultSchema = z.object({
  schemaVersion: z.literal(1),
  source: sourceSchema,
  query: polishQuery,
  records: z
    .array(
      z.object({
        url: z.string().url().max(4000),
        listing: z.record(z.string(), z.unknown()),
        detail: z.record(z.string(), z.unknown()),
      }),
    )
    .max(200),
  status: z.enum(['complete', 'partial', 'failed']),
  diagnostics: z.object({
    pages: count,
    totalCount: count.nullable(),
    requests: count,
    rejected: count,
    duplicates: count,
    filtered: count,
    aliases: count.optional(),
    missingDescriptions: count,
    stopReason: z
      .string()
      .regex(
        /^(exhausted|source_limit|cursor_loop|invalid_cursor|incomplete_count|offer_limit|page_limit|request_limit|deadline|challenge|invalid_record|invalid_pagination|changing_pagination|response_limit|output_limit|invalid_response|invalid_content_type|fetch_or_parse_error|http_[1-5]\d{2})$/,
      ),
  }),
})
export function parsePolish(value: unknown, query: PolishQuery) {
  const parsed = resultSchema.safeParse(value)
  if (
    !parsed.success ||
    parsed.data.source !== query.source ||
    hash(parsed.data.query) !== hash(query)
  )
    throw new Error('Invalid Polish source result')
  const data = parsed.data,
    jobs: Offer[] = [],
    ids = new Set<string>()
  let rejected = 0,
    duplicates = 0,
    missingDescriptions = 0
  for (const record of data.records) {
    try {
      const job = normalize(query.source, record, query)
      if (ids.has(job.jobOfferKey)) {
        duplicates++
        continue
      }
      ids.add(job.jobOfferKey)
      if (!job.description) missingDescriptions++
      jobs.push(job)
    } catch {
      rejected++
    }
  }
  const incomplete =
    data.status !== 'complete' ||
    data.diagnostics.stopReason !== 'exhausted' ||
    data.diagnostics.rejected > 0 ||
    data.diagnostics.duplicates > 0 ||
    data.diagnostics.missingDescriptions > 0 ||
    rejected > 0 ||
    duplicates > 0 ||
    missingDescriptions > 0
  const status = incomplete ? (jobs.length ? 'partial' : 'failed') : 'complete'
  return {
    jobs,
    status,
    diagnostics: {
      ...data.diagnostics,
      rejected: data.diagnostics.rejected + rejected,
      duplicates: data.diagnostics.duplicates + duplicates,
      missingDescriptions,
      query,
      marketComplete: false,
    },
    error: incomplete ? 'Import niepełny; sprawdź diagnostykę źródła' : null,
  }
}
export type PolishBatch = ReturnType<typeof parsePolish>
export type PolishProcessOptions = {
  python?: string
  runner?: string
  timeoutMs?: number
  maxBytes?: number
}
export function runPolish(
  query: PolishQuery,
  options: PolishProcessOptions = {},
): Promise<unknown> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      options.python ?? process.env.JOBSPY_PYTHON ?? '/opt/jobspy/bin/python',
      [options.runner ?? resolve('scripts/polish-runner.py')],
      {
        shell: false,
        detached: process.platform !== 'win32',
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          LANG: 'C.UTF-8',
          PYTHONUNBUFFERED: '1',
          DOCUMENTS_DIR: process.env.DOCUMENTS_DIR ?? '/data/documents',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    let bytes = 0,
      issue: string | null = null
    const chunks: Buffer[] = []
    const stop = (message: string) => {
      issue ??= message
      try {
        if (child.pid && process.platform !== 'win32')
          process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        /* Already exited. */
      }
    }
    const timer = setTimeout(
      () => stop('Polish source process timed out'),
      options.timeoutMs ?? 180_000,
    )
    const read = (chunk: Buffer, stdout: boolean) => {
      bytes += chunk.length
      if (bytes > (options.maxBytes ?? 8 * 1024 * 1024))
        stop('Polish source output limit exceeded')
      else if (stdout) chunks.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => read(chunk, true))
    child.stderr.on('data', (chunk: Buffer) => read(chunk, false))
    child.stdin.on('error', () => {})
    child.on('error', () => {
      issue ??= 'Polish source process could not start'
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (issue || code !== 0) {
        reject(new Error(issue ?? 'Polish source process failed'))
        return
      }
      try {
        resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid Polish source process output'))
      }
    })
    child.stdin.end(JSON.stringify(query))
  })
}
