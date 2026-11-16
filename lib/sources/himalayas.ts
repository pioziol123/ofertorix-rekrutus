import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { hash, type Offer } from './solid.ts'
import { RetryDeferredError } from '../../modules/sources/infrastructure/adapters/connector.ts'
import {
  createHttpRequest,
  type Clock,
} from '../../modules/sources/infrastructure/adapters/http-request.ts'

export const source = 'himalayas'
/** Why a Himalayas run is incomplete; the diagnostics say more. */
export const incompleteReason =
  'Himalayas pilot incomplete; inspect diagnostics'
export const parameters = {
  source,
  adapterVersion: 1,
  q: 'PHP',
  country: 'PL',
  seniority: 'Senior',
  sort: 'recent',
  pageSize: 20,
  maxPages: 5,
} as const
export const fingerprint = hash(parameters)

export function pageUrl(page: number): URL {
  if (!Number.isSafeInteger(page) || page < 1 || page > parameters.maxPages)
    throw new Error('Invalid Himalayas page')
  const url = new URL('https://himalayas.app/jobs/api/search')
  for (const key of ['q', 'country', 'seniority', 'sort'] as const)
    url.searchParams.set(key, parameters[key])
  url.searchParams.set('page', String(page))
  return url
}

const count = z.number().int().nonnegative().max(1_000_000)
const envelope = z.object({
  jobs: z.array(z.unknown()).max(20),
  totalCount: count,
  offset: count,
  limit: z.literal(20),
})
const portalUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        url.hostname === 'himalayas.app' &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^\/companies\/[^/]+\/jobs\/[^/]+\/?$/.test(url.pathname)
      )
    } catch {
      return false
    }
  })
const nullableText = z.string().nullable().optional()
const amount = z.number().finite().nonnegative().nullable().optional()
const record = z
  .object({
    guid: portalUrl,
    applicationLink: portalUrl,
    title: z.string().trim().min(1).max(2000),
    companyName: nullableText,
    description: z.string().max(500_000).nullable().optional(),
    locationRestrictions: z.array(z.string()).optional(),
    timezoneRestrictions: z.array(z.number()).optional(),
    seniority: z
      .union([z.string(), z.array(z.string())])
      .nullable()
      .optional(),
    minSalary: amount,
    maxSalary: amount,
    currency: nullableText,
    salaryPeriod: nullableText,
    pubDate: z.number().finite().nonnegative().nullable().optional(),
    expiryDate: z.number().finite().nonnegative().nullable().optional(),
  })
  .passthrough()

const timestamp = (value: number | null | undefined) => {
  if (value == null) return null
  const date = new Date(value * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
const periods: Record<string, string> = {
  annual: 'Year',
  monthly: 'Month',
  weekly: 'Week',
  hourly: 'Hour',
}
export type HimalayasPage = {
  jobs: Offer[]
  totalCount: number
  valid: boolean
  rejected: number
  missingDescriptions: number
}

export function parsePage(value: unknown, page: number): HimalayasPage {
  const parsed = envelope.safeParse(value)
  if (!parsed.success) throw new Error('Invalid Himalayas response')
  const data = parsed.data
  const jobs: Offer[] = []
  let rejected = 0
  for (const raw of data.jobs) {
    const parsedJob = record.safeParse(raw)
    if (!parsedJob.success) {
      rejected++
      continue
    }
    const job = parsedJob.data
    const from = job.minSalary ?? null,
      to = job.maxSalary ?? null
    const validSalary = from === null || to === null || from <= to
    if (!validSalary) {
      rejected++
      continue
    }
    jobs.push({
      jobOfferKey: job.guid,
      url: job.applicationLink,
      title: job.title,
      company: job.companyName ?? null,
      description: job.description ?? null,
      locations: job.locationRestrictions ?? [],
      validFrom: null,
      sourceUpdatedAt: timestamp(job.pubDate),
      validTo: timestamp(job.expiryDate),
      experienceLevel: Array.isArray(job.seniority)
        ? job.seniority.join(', ') || null
        : (job.seniority ?? null),
      skills: /\bphp\b/i.test(job.title) ? [{ name: 'PHP' }] : [],
      isRemote: true,
      salary:
        from !== null || to !== null
          ? {
              from,
              to,
              currency: job.currency ?? null,
              period: periods[job.salaryPeriod ?? ''] ?? null,
              employmentType: null,
              origin: 'unknown',
            }
          : null,
      qualificationUnknown: ['PHP', 'senior'],
      sourceRecord: raw,
    })
  }
  return {
    jobs,
    totalCount: data.totalCount,
    valid:
      data.offset === (page - 1) * 20 &&
      data.jobs.length ===
        Math.min(20, Math.max(0, data.totalCount - data.offset)),
    rejected,
    missingDescriptions: jobs.filter((j) => !String(j.description ?? '').trim())
      .length,
  }
}

export class HimalayasHttpError extends Error {
  constructor(
    public status: number,
    public retryAfter: string | null,
  ) {
    super(`Himalayas HTTP ${status}`)
  }
}

/**
 * Reads one search page, 1 s after the previous one. Transport limits and
 * retries come from the shared HTTP helper, with no retry that would end
 * after `deadlineAt` (clock time); a final error status is thrown as
 * `HimalayasHttpError`.
 */
export function createPageFetcher(
  fetcher: typeof fetch = fetch,
  sleep = (ms: number) => delay(ms),
  clock?: Clock,
) {
  const request = createHttpRequest({
    label: 'Himalayas',
    fetch: fetcher,
    sleep,
    clock,
    maxBytes: 8 * 1024 * 1024,
  })
  return async (
    page: number,
    signal?: AbortSignal,
    deadlineAt?: number,
  ): Promise<HimalayasPage> => {
    const url = pageUrl(page)
    // Sequential caller holds the database lock; no hidden redirect.
    await sleep(1000)
    let response
    try {
      response = await request(
        url,
        { redirect: 'error', headers: { Accept: 'application/json' } },
        signal,
        { deadlineAt },
      )
    } catch (error) {
      if (error instanceof RetryDeferredError)
        throw new HimalayasHttpError(error.status, error.retryAfter)
      throw error
    }
    if (!response.ok)
      throw new HimalayasHttpError(
        response.status,
        response.headers.get('retry-after'),
      )
    return parsePage(JSON.parse(response.body.toString('utf8')), page)
  }
}
