import { describe, expect, it, vi } from 'vitest'
import {
  createPageFetcher,
  hash,
  pageUrl,
  parameters,
  parsePage,
  scheduleDay,
} from '../lib/sources/solid.ts'

const envelope = (jobs: unknown[] = []) => ({
  jobs,
  pageIndex: 0,
  pageSize: 100,
  totalCount: jobs.length,
  totalPages: jobs.length ? 1 : 0,
})

describe('SOLID.Jobs source adapter', () => {
  it('requests only native Developer/PHP/Senior and stable sorting', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(envelope()))
    await createPageFetcher(fetcher, async () => {})(0)
    const url = pageUrl(0)
    expect(url.pathname).toBe('/public-api/offers/IT')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      campaign: 'oferty-pracy-local',
      pageIndex: '0',
      pageSize: '100',
      sortActive: 'validFrom',
      sortDirection: 'asc',
      'search.categories': 'Developer',
      'search.subCategories': 'PHP',
      'search.experiences': 'Senior',
    })
    expect(fetcher.mock.calls[0]![1]!.headers).toEqual({
      'X-Api-Version': '1.0',
    })
    expect(parameters.experience).toBe('Senior')
  })

  it('preserves unknown fields and future enums without inventing missing fields', () => {
    const job = {
      jobOfferKey: 'a',
      future: { enum: 'NEW', raw: [null, 3] },
      experienceLevel: 'Senior',
      description: '<script>raw</script>',
    }
    const page = parsePage(envelope([job]), 0)
    expect(page.valid).toBe(true)
    expect(page.jobs).toEqual([job])
    expect(page.jobs[0]).not.toHaveProperty('salaryFrom')
    expect(hash({ a: 1, b: { x: 2, y: 3 } })).toBe(
      hash({ b: { y: 3, x: 2 }, a: 1 }),
    )
    expect(hash({ a: [1, 2] })).not.toBe(hash({ a: [2, 1] }))
  })

  it('flags inconsistent metadata and bad IDs while retaining usable offers', () => {
    const page = parsePage(
      {
        ...envelope([{ jobOfferKey: 'ok' }, { title: 'missing id' }]),
        totalPages: 9,
      },
      0,
    )
    expect(page.valid).toBe(false)
    expect(page.jobs).toEqual([{ jobOfferKey: 'ok' }])
    expect(() => parsePage({ jobs: null }, 0)).toThrow()
  })

  it('retries a transient failure once and respects bounded Retry-After', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(Response.json(envelope()))
    const sleep = vi.fn(async (_ms: number) => {})
    await createPageFetcher(fetcher, sleep)(0)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2000)
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 503 }))
    await expect(
      createPageFetcher(unavailable, async () => {})(0),
    ).rejects.toThrow('503')
    expect(unavailable).toHaveBeenCalledTimes(2)
    const deferred = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('', { status: 429, headers: { 'Retry-After': '90' } }),
      )
    await expect(
      createPageFetcher(deferred, async () => {})(0),
    ).rejects.toThrow('deferred')
    expect(deferred).toHaveBeenCalledTimes(1)
  })

  it('does not retry permanent HTTP errors or malformed successful payloads', async () => {
    for (const response of [
      new Response('', { status: 400 }),
      Response.json({ unexpected: true }),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
      await expect(
        createPageFetcher(fetcher, async () => {})(0),
      ).rejects.toThrow()
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network'))
    await expect(createPageFetcher(fetcher, async () => {})(0)).rejects.toThrow(
      'after retry',
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('Warsaw schedule slots', () => {
  it.each([
    ['2026-03-29T05:59:00Z', '2026-03-28'],
    ['2026-03-29T06:00:00Z', '2026-03-29'],
    ['2026-10-25T06:59:00Z', '2026-10-24'],
    ['2026-10-25T07:00:00Z', '2026-10-25'],
    ['2027-01-01T00:00:00Z', '2026-12-31'],
  ])('assigns %s to the latest due daily slot %s', (now, expected) => {
    expect(scheduleDay(new Date(now), '08:00')).toBe(expected)
  })
  it('rejects invalid configuration rather than silently changing the schedule', () => {
    expect(() => scheduleDay(new Date(), '24:00')).toThrow('HH:mm')
    expect(() => scheduleDay(new Date(), '8:00')).toThrow('HH:mm')
  })
})
