import { setTimeout as delay } from 'node:timers/promises'
import { ConnectorError } from '../../modules/sources/infrastructure/adapters/connector.ts'
import {
  createHttpRequest,
  type Clock,
} from '../../modules/sources/infrastructure/adapters/http-request.ts'
import { hash } from '../../modules/sources/domain/canonical-hash.ts'

export { canonical, hash } from '../../modules/sources/domain/canonical-hash.ts'

export const source = 'solid-jobs'
export const importQueue = 'source-solid-jobs'
export const parameters = {
  division: 'IT',
  category: 'Developer',
  subCategory: 'PHP',
  experience: 'Senior',
  apiVersion: '1.0',
  ruleVersion: 1,
  pageSize: 100,
  sort: 'validFrom',
  direction: 'asc',
} as const

export const fingerprint = hash(parameters)
export type Offer = Record<string, unknown> & { jobOfferKey: string }
export type Page = {
  jobs: Offer[]
  totalCount: number
  totalPages: number
  valid: boolean
}

export function pageUrl(pageIndex: number): URL {
  const url = new URL('https://solid.jobs/public-api/offers/IT')
  for (const [key, value] of Object.entries({
    campaign: 'oferty-pracy-local',
    pageIndex,
    pageSize: parameters.pageSize,
    sortActive: parameters.sort,
    sortDirection: parameters.direction,
    'search.categories': parameters.category,
    'search.subCategories': parameters.subCategory,
    'search.experiences': parameters.experience,
  }))
    url.searchParams.set(key, String(value))
  return url
}

export function parsePage(value: unknown, index: number): Page {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid API envelope')
  const data = value as Record<string, unknown>
  if (!Array.isArray(data.jobs)) throw new Error('Missing API jobs array')
  const jobs = data.jobs.filter(
    (job): job is Offer =>
      !!job &&
      typeof job === 'object' &&
      typeof job.jobOfferKey === 'string' &&
      job.jobOfferKey.trim().length > 0,
  )
  const count = data.totalCount
  const pages = data.totalPages
  const valid =
    Number.isSafeInteger(count) &&
    Number(count) >= 0 &&
    Number.isSafeInteger(pages) &&
    Number(pages) >= 0 &&
    Number(pages) === Math.ceil(Number(count) / parameters.pageSize) &&
    data.pageIndex === index &&
    data.pageSize === parameters.pageSize &&
    jobs.length === data.jobs.length &&
    jobs.length ===
      Math.min(
        parameters.pageSize,
        Math.max(0, Number(count) - index * parameters.pageSize),
      )
  return { jobs, totalCount: Number(count), totalPages: Number(pages), valid }
}

/**
 * Reads one API page. Requests are at least 1 s apart; transport limits and
 * retries come from the shared HTTP helper.
 */
export function createPageFetcher(
  fetcher: typeof fetch = fetch,
  sleep = (ms: number) => delay(ms),
  clock?: Clock,
) {
  const now = () => clock?.now() ?? Date.now()
  let lastRequest = 0
  // Every attempt, retries included, counts towards the interval.
  const request = createHttpRequest({
    label: 'API',
    fetch: (url, init) => {
      lastRequest = now()
      return fetcher(url, init)
    },
    sleep,
    clock,
  })
  return async (index: number, signal?: AbortSignal): Promise<Page> => {
    await sleep(Math.max(0, 1000 - (now() - lastRequest)))
    const response = await request(
      pageUrl(index),
      { headers: { 'X-Api-Version': parameters.apiVersion } },
      signal,
    )
    if (!response.ok) throw new ConnectorError(`API HTTP ${response.status}`)
    try {
      return parsePage(JSON.parse(response.body.toString('utf8')), index)
    } catch {
      throw new ConnectorError('Invalid API response')
    }
  }
}

export function scheduleDay(
  now = new Date(),
  time = process.env.SOURCE_SYNC_TIME ?? '08:00',
): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('SOURCE_SYNC_TIME must be HH:mm')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  const today = `${part('year')}-${part('month')}-${part('day')}`
  if (`${part('hour')}:${part('minute')}` >= time) return today
  return new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)
}
