import { describe, expect, it, vi } from 'vitest'
import { createPageFetcher } from '../../../../lib/sources/solid.ts'
import { jobspySources } from '../../../../lib/sources/jobspy-catalog.ts'
import { polishSources } from '../../../../lib/sources/polish-catalog.ts'
import { hash } from '../../domain/canonical-hash.ts'
import type { ConnectorAd, SourceConnector } from './connector.ts'
import { createHimalayasConnector } from './himalayas/connector.ts'
import { createJobspyConnector } from './jobspy/connector.ts'
import { createPolishConnector } from './polish/connector.ts'
import { createSolidJobsConnector } from './solid-jobs/connector.ts'

const connectors: SourceConnector[] = [
  createSolidJobsConnector(),
  createHimalayasConnector(),
  ...jobspySources.map((source) => createJobspyConnector(source)),
  ...polishSources.map((source) => createPolishConnector(source)),
]

/** Fingerprints of the default scopes, computed before the connectors. */
const fingerprintsBefore: Record<string, string> = {
  'solid-jobs':
    '73150b51ad8151ead9472199bb3cb359f5f77062c0bc1f9a3b7dbee3854e93e4',
  himalayas: '6d167585e3229f6d0565b0968ffa17fb382d974f8d4d0e54a5a28fd4c7a0baab',
  indeed: '853036b841d597b26033d8ca4f328ac10410d13febd8ebd378e4011cf7ce6ace',
  linkedin: 'afdbcebc258366706e9b597c0c63aa25bad9e4e72781c65b0c73514360ba1c6f',
  bayt: '2f15994f8d3e957ed6b4a8978dddb0b62e696dd82e2f2a1c9740fd3d903a8ed1',
  glassdoor: 'e9e240ab5f5393d9306a86e2be63a0b3b57c0a02b13e5b379a32520283dbf5e0',
  zip_recruiter:
    '0e7e78e994448487f11dabb02188783cd14c96501c1c6a5d7929ee11d5c96cc3',
  naukri: '944041a2d2df2377be7f83fa1ef1ce1418ea133d163da2619c774fbc2ca46ed7',
  bdjobs: '42c7108df9fba3d5625ab8b569f7e48bd942c49c14deea040cb0555915642305',
  hellowork: 'ced986f4d5de0ec49d2219580cc6e6748c7a18fa684af8e61967948a737b83c1',
  google: 'eb7691fe0e10916faadc8c4db03a4d5b3aa682346808fe83b56cc2e6aecc45d1',
  bulldogjob:
    'cd6ead946dde0da7cd57d7e6cb3f51d49660d4eddb4bb6374913788dff8db0cb',
  theprotocol:
    'd1d624d22657bc7825e94202f8f68778c4847d954d070d93d0405370aa41e1dc',
  justjoinit:
    'dbfbd15536384b39677dab0d4064d47e2b784608657a8aa4b57ce0fe1646cdca',
  nofluffjobs:
    '593fad95b459130f08603c11460e7ae4a63eb1de357481c20ef60b9a5d089b68',
}

const defaultRequest = (connector: SourceConnector) =>
  (polishSources as readonly string[]).includes(connector.name)
    ? { source: connector.name }
    : undefined

describe('source connectors', () => {
  it('cover every source of the catalogues under their existing names', () => {
    expect(connectors.map((c) => c.name).sort()).toEqual(
      Object.keys(fingerprintsBefore).sort(),
    )
  })

  it('keep the fingerprints of the default scopes', () => {
    for (const connector of connectors)
      expect(
        hash(connector.scopeParameters(defaultRequest(connector))),
        connector.name,
      ).toBe(fingerprintsBefore[connector.name])
  })

  it('give one scope to Polish requests that differ only in parameter order', () => {
    const connector = createPolishConnector('justjoinit')
    const first = connector.scopeParameters({
      source: 'justjoinit',
      technology: 'Java',
      seniority: 'mid',
      maxOffers: 20,
    })
    const second = connector.scopeParameters({
      maxOffers: 20,
      seniority: 'mid',
      technology: 'Java',
      source: 'justjoinit',
    })
    expect(hash(first)).toBe(hash(second))
    expect(
      hash(
        connector.scopeParameters({
          source: 'justjoinit',
          technology: 'Java',
          seniority: 'mid',
          maxOffers: 21,
        }),
      ),
    ).not.toBe(hash(first))
  })

  it('rejects a Polish request for another portal', () => {
    expect(() =>
      createPolishConnector('bulldogjob').scopeParameters({
        source: 'justjoinit',
      }),
    ).toThrow('Invalid Polish source result')
  })

  it('allow inference from absence only for SOLID.Jobs', () => {
    expect(
      Object.fromEntries(
        connectors.map((c) => [c.name, c.infersUnavailabilityFromAbsence]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.keys(fingerprintsBefore).map((name) => [
          name,
          name === 'solid-jobs',
        ]),
      ),
    )
  })
})

describe('SOLID.Jobs connector', () => {
  const offer = (id: string) => ({ jobOfferKey: id, url: `https://x/${id}` })
  /** An API answering every page from the list, with consistent metadata. */
  function api(pages: string[][], totalCount = pages.flat().length) {
    return vi.fn<typeof fetch>(async (url) => {
      const index = Number(new URL(String(url)).searchParams.get('pageIndex'))
      return Response.json({
        jobs: (pages[index] ?? []).map(offer),
        pageIndex: index,
        pageSize: 100,
        totalCount,
        totalPages: Math.ceil(totalCount / 100),
      })
    })
  }
  const ids = (count: number, prefix: string) =>
    Array.from({ length: count }, (_, i) => `${prefix}-${i}`)

  async function fetchAll(fetcher: typeof fetch) {
    const connector = createSolidJobsConnector(
      createPageFetcher(fetcher, async () => {}),
    )
    const batches: ConnectorAd[][] = []
    const result = await connector.fetch(
      connector.scopeParameters(),
      async (ads) => {
        batches.push(ads)
      },
      new AbortController().signal,
    )
    return { result, batches }
  }

  it('hands over three pages of results as three batches', async () => {
    const pages = [ids(100, 'a'), ids(100, 'b'), ids(50, 'c')]
    const fetcher = api(pages)
    const { result, batches } = await fetchAll(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(batches.map((batch) => batch.map((ad) => ad.externalId))).toEqual(
      pages,
    )
    expect(batches[0]![0]).toEqual({
      externalId: 'a-0',
      url: 'https://x/a-0',
      validTo: null,
      content: offer('a-0'),
    })
    expect(result).toEqual({ complete: true })
  })

  it('fetches every page despite repeated ads and reports the scope incomplete', async () => {
    const pages = [
      [...ids(99, 'a'), 'a-0'],
      [...ids(99, 'b'), 'a-1'],
      ids(50, 'c'),
    ]
    const fetcher = api(pages)
    const { result, batches } = await fetchAll(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(batches).toHaveLength(3)
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50])
    expect(result).toEqual({
      complete: false,
      reason:
        'Invalid or changing pagination; saved valid offers, availability unchanged',
    })
  })

  it('passes a batch failure on without fetching more pages', async () => {
    const fetcher = api([ids(100, 'a'), ids(100, 'b')])
    const connector = createSolidJobsConnector(
      createPageFetcher(fetcher, async () => {}),
    )
    const failure = new Error('storage failed')
    await expect(
      connector.fetch(
        connector.scopeParameters(),
        async () => {
          throw failure
        },
        new AbortController().signal,
      ),
    ).rejects.toBe(failure)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('stops with an abort error once the signal is aborted', async () => {
    const fetcher = api([ids(100, 'a'), ids(100, 'b')])
    const connector = createSolidJobsConnector(
      createPageFetcher(fetcher, async () => {}),
    )
    const controller = new AbortController()
    await expect(
      connector.fetch(
        connector.scopeParameters(),
        async () => controller.abort(),
        controller.signal,
      ),
    ).rejects.toThrow('Source fetch aborted')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
