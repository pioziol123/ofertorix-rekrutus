import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPageFetcher,
  HimalayasHttpError,
  pageUrl,
  parameters,
  parsePage,
} from '../lib/sources/himalayas.ts'

const job = (overrides: Record<string, unknown> = {}) => ({
  guid: 'https://himalayas.app/companies/acme/jobs/php',
  applicationLink:
    'https://himalayas.app/companies/acme/jobs/php?ref=api%2Bfeed',
  title: 'Senior PHP Engineer',
  companyName: 'Acme',
  description: '<p>Full description</p>',
  locationRestrictions: ['Poland', 'Germany'],
  timezoneRestrictions: [1, 2],
  seniority: ['Senior'],
  pubDate: 1_700_000_000,
  expiryDate: 1_800_000_000,
  ...overrides,
})
const response = (
  jobs: unknown[],
  overrides: Record<string, unknown> = {},
) => ({
  jobs,
  totalCount: jobs.length,
  offset: 0,
  limit: 20,
  ...overrides,
})

afterEach(() => vi.useRealTimers())

describe('Himalayas source contract', () => {
  it('uses only the agreed search scope and bounded page numbers', () => {
    const url = pageUrl(2)
    expect(url.origin + url.pathname).toBe(
      'https://himalayas.app/jobs/api/search',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'PHP',
      country: 'PL',
      seniority: 'Senior',
      sort: 'recent',
      page: '2',
    })
    expect(parameters.maxPages).toBe(5)
    for (const invalid of [0, -1, 1.5, 6, Number.NaN])
      expect(() => pageUrl(invalid)).toThrow()
  })

  it('preserves raw content and exact application link without claiming publication or qualification', () => {
    const raw = job({
      minSalary: 100,
      maxSalary: 200,
      currency: 'USD',
      salaryPeriod: 'annual',
      future: { retained: true },
    })
    const parsed = parsePage(response([raw]), 1)
    expect(parsed).toMatchObject({
      valid: true,
      rejected: 0,
      missingDescriptions: 0,
    })
    expect(parsed.jobs[0]).toMatchObject({
      jobOfferKey: raw.guid,
      url: raw.applicationLink,
      description: raw.description,
      locations: ['Poland', 'Germany'],
      validFrom: null,
      sourceUpdatedAt: new Date(raw.pubDate * 1000).toISOString(),
      validTo: new Date(raw.expiryDate * 1000).toISOString(),
      qualificationUnknown: ['PHP', 'senior'],
      sourceRecord: raw,
      salary: {
        from: 100,
        to: 200,
        currency: 'USD',
        period: 'Year',
        employmentType: null,
        origin: 'unknown',
      },
    })
  })

  it('keeps unknown pay units, currencies and missing fields unknown', () => {
    const parsed = parsePage(
      response([
        job({
          minSalary: 10,
          salaryPeriod: 'fortnightly',
          currency: null,
          locationRestrictions: undefined,
          seniority: undefined,
        }),
        job({ minSalary: null, maxSalary: null, description: null }),
      ]),
      1,
    )
    expect(parsed.jobs[0]).toMatchObject({
      salary: {
        from: 10,
        to: null,
        period: null,
        currency: null,
        employmentType: null,
        origin: 'unknown',
      },
      locations: [],
      experienceLevel: null,
    })
    expect(parsed.jobs[0]!.sourceRecord).toMatchObject({
      salaryPeriod: 'fortnightly',
    })
    expect(parsed.jobs[1]!.salary).toBeNull()
    expect(parsed.missingDescriptions).toBe(1)
  })

  it.each([
    null,
    {},
    { jobs: [], totalCount: '0', offset: 0, limit: 20 },
    response([], { limit: 10 }),
    response([], { totalCount: -1 }),
    response(Array.from({ length: 21 }, () => job())),
  ])('rejects an invalid response envelope', (value) => {
    expect(() => parsePage(value, 1)).toThrow('Invalid Himalayas response')
  })

  it('rejects invalid records individually while preserving valid jobs', () => {
    const invalid = [
      job({ guid: 'https://evil.example/companies/acme/jobs/php' }),
      job({ applicationLink: 'http://himalayas.app/companies/acme/jobs/php' }),
      job({
        applicationLink:
          'https://user:pass@himalayas.app/companies/acme/jobs/php',
      }),
      job({ guid: 'https://himalayas.app:8443/companies/acme/jobs/php' }),
      job({ guid: 'not a URL' }),
      job({ applicationLink: 'https://' }),
      job({ title: ' ' }),
      job({ minSalary: 200, maxSalary: 100 }),
      job({ minSalary: -1 }),
      job({ locationRestrictions: 'Poland' }),
    ]
    const parsed = parsePage(response([job(), ...invalid]), 1)
    expect(parsed.jobs).toHaveLength(1)
    expect(parsed.rejected).toBe(invalid.length)
  })

  it.each([{ totalCount: 2 }, { offset: 20 }, { totalCount: 0 }])(
    'exposes inconsistent page metadata while retaining valid records',
    (overrides) => {
      const parsed = parsePage(response([job()], overrides), 1)
      expect(parsed.valid).toBe(false)
      expect(parsed.jobs).toHaveLength(1)
    },
  )
})

describe('Himalayas bounded HTTP transport', () => {
  it('waits before each read and disables redirects with a timeout signal', async () => {
    const order: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      order.push('fetch')
      expect(options?.redirect).toBe('error')
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      expect(options?.signal?.aborted).toBe(false)
      return Response.json(response([job()]))
    })
    const sleep = vi.fn(async (milliseconds: number) => {
      expect(milliseconds).toBe(1000)
      order.push('sleep')
    })
    const read = createPageFetcher(fetcher, sleep)
    expect((await read(1)).jobs).toHaveLength(1)
    await read(1)
    expect(order).toEqual(['sleep', 'fetch', 'sleep', 'fetch'])
  })

  it.each([403, 429])(
    'does not retry HTTP %i and exposes Retry-After',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('blocked', { status, headers: { 'Retry-After': '60' } }),
        )
      await expect(
        createPageFetcher(fetcher, async () => {})(1),
      ).rejects.toMatchObject({ status, retryAfter: '60' })
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(new HimalayasHttpError(status, null).message).toBe(
        `Himalayas HTTP ${status}`,
      )
    },
  )

  it('aborts a request after the declared timeout without retrying', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            'abort',
            () => reject(options!.signal!.reason),
            { once: true },
          )
        }),
    )
    // AbortSignal.timeout uses a native timer; inspect its configured duration via a spy.
    const signal = new AbortController()
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(signal.signal)
    try {
      const pending = createPageFetcher(fetcher, async () => {})(1)
      const assertion = expect(pending).rejects.toThrow('timed out')
      await Promise.resolve()
      signal.abort(new Error('timed out'))
      await assertion
      expect(timeout).toHaveBeenCalledWith(20_000)
      expect(fetcher).toHaveBeenCalledTimes(1)
    } finally {
      timeout.mockRestore()
    }
  })

  it('rejects oversized streamed responses and malformed JSON', async () => {
    const huge = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(8 * 1024 * 1024 + 1)))
    await expect(createPageFetcher(huge, async () => {})(1)).rejects.toThrow(
      'response too large',
    )
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{not-json'))
    await expect(
      createPageFetcher(malformed, async () => {})(1),
    ).rejects.toThrow()
  })
})
