import {
  createPageFetcher,
  parameters,
  source,
  type Page,
} from '../../../../../lib/sources/solid.ts'
import {
  throwIfAborted,
  toConnectorAd,
  type SourceConnector,
} from '../connector.ts'

export type SolidJobsPageFetcher = (
  index: number,
  signal?: AbortSignal,
) => Promise<Page>

const pageLimit = 1000
const unstable =
  'Invalid or changing pagination; saved valid offers, availability unchanged'

/**
 * SOLID.Jobs public API, one batch per page. The scope is complete when
 * every page is valid, the result and page counts stay the same, the number
 * of unique ads equals the result count and the page limit is not exceeded.
 * A repeated ad makes the result incomplete but does not stop fetching.
 */
export function createSolidJobsConnector(
  injectedFetchPage?: SolidJobsPageFetcher,
): SourceConnector {
  return {
    name: source,
    infersUnavailabilityFromAbsence: true,
    scopeParameters: () => ({ ...parameters }),
    async fetch(_parameters, onBatch, signal) {
      // A fetcher per run keeps the request pacing local to the run, as when
      // each run built its own connector.
      const fetchPage = injectedFetchPage ?? createPageFetcher()
      const ids = new Set<string>()
      let baseline: Page | undefined
      let issue: string | undefined
      for (let index = 0; index < pageLimit; index++) {
        throwIfAborted(signal)
        const page = await fetchPage(index, signal)
        baseline ??= page
        let duplicate = false
        for (const job of page.jobs) {
          if (ids.has(job.jobOfferKey)) duplicate = true
          ids.add(job.jobOfferKey)
        }
        await onBatch(page.jobs.map(toConnectorAd))
        if (
          !page.valid ||
          page.totalCount !== baseline.totalCount ||
          page.totalPages !== baseline.totalPages
        ) {
          issue ??= unstable
          break
        }
        if (duplicate) issue ??= unstable
        if (index + 1 >= baseline.totalPages) break
        if (index === pageLimit - 1)
          issue ??= 'Import page safety limit exceeded'
      }
      if (!baseline || ids.size !== baseline.totalCount)
        issue ??= 'Incomplete unique offer count'
      return issue ? { complete: false, reason: issue } : { complete: true }
    },
  }
}
