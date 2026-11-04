import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

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

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
export function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
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

export function createPageFetcher(
  fetcher: typeof fetch = fetch,
  sleep = (ms: number) => delay(ms),
) {
  let lastRequest = 0
  return async (index: number): Promise<Page> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(Math.max(0, 1000 - (Date.now() - lastRequest)))
      lastRequest = Date.now()
      let response: Response
      try {
        response = await fetcher(pageUrl(index), {
          headers: { 'X-Api-Version': parameters.apiVersion },
          signal: AbortSignal.timeout(30_000),
        })
      } catch {
        if (attempt === 0) continue
        throw new Error('API network error or timeout after retry')
      }
      if (response.ok) {
        try {
          return parsePage(await response.json(), index)
        } catch {
          throw new Error('Invalid API response')
        }
      }
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt === 0
      ) {
        const retry = response.headers.get('retry-after')
        const seconds = retry === null ? 1 : Number(retry)
        const wait = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retry!) - Date.now()
        // Do not retry earlier than Retry-After when it exceeds our waiting budget.
        if (!Number.isFinite(wait) || wait > 60_000)
          throw new Error(`API HTTP ${response.status}; retry deferred`)
        await sleep(Math.max(1000, wait))
        continue
      }
      throw new Error(`API HTTP ${response.status}`)
    }
    throw new Error('API attempt limit reached')
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
