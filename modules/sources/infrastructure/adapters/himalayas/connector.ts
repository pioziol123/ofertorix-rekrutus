import {
  createPageFetcher,
  HimalayasHttpError,
  parameters,
  source,
  type HimalayasPage,
} from '../../../../../lib/sources/himalayas.ts'
import {
  ConnectorAbortedError,
  throwIfAborted,
  toConnectorAd,
  type SourceConnector,
} from '../connector.ts'

export type HimalayasPageFetcher = (
  page: number,
  signal?: AbortSignal,
  deadlineAt?: number,
) => Promise<HimalayasPage>

export const incompleteReason =
  'Himalayas pilot incomplete; inspect diagnostics'
const deadlineMs = 120_000
// Existing completeness criterion: no page starts later than 21 s before the
// deadline. Retries of a page also end by the deadline.
const pageBudgetMs = 21_000

/**
 * Himalayas search API, one batch per page with repeated ads left out.
 * The scope is complete only when every page is consistent, no record is
 * rejected, repeated or missing a description, and the results end within
 * the page limit and the deadline. A fetch failure ends the fetch as
 * incomplete; the diagnostics say why.
 */
export function createHimalayasConnector(
  fetchPage: HimalayasPageFetcher = createPageFetcher(),
): SourceConnector {
  return {
    name: source,
    infersUnavailabilityFromAbsence: false,
    scopeParameters: () => ({ ...parameters }),
    async fetch(_parameters, onBatch, signal) {
      const diagnostics = {
        query: parameters,
        pages: 0,
        totalCount: null as number | null,
        duplicates: 0,
        rejected: 0,
        missingDescriptions: 0,
        stopReason: 'exhausted',
        retryAfter: null as string | null,
        marketComplete: false,
      }
      const ids = new Set<string>()
      let incomplete = false
      const deadline = Date.now() + deadlineMs
      for (let index = 1; index <= parameters.maxPages; index++) {
        if (Date.now() + pageBudgetMs > deadline) {
          incomplete = true
          diagnostics.stopReason = 'deadline'
          break
        }
        throwIfAborted(signal)
        let page: HimalayasPage
        try {
          page = await fetchPage(index, signal, deadline)
        } catch (error) {
          if (error instanceof ConnectorAbortedError) throw error
          incomplete = true
          diagnostics.stopReason =
            error instanceof HimalayasHttpError
              ? `http_${error.status}`
              : 'fetch_or_processing_error'
          diagnostics.retryAfter = safeRetryAfter(error)
          break
        }
        diagnostics.pages++
        diagnostics.totalCount ??= page.totalCount
        diagnostics.rejected += page.rejected
        diagnostics.missingDescriptions += page.missingDescriptions
        const unique = page.jobs.filter((job) => {
          if (ids.has(job.jobOfferKey)) {
            diagnostics.duplicates++
            return false
          }
          ids.add(job.jobOfferKey)
          return true
        })
        await onBatch(unique.map(toConnectorAd))
        incomplete ||=
          page.rejected > 0 ||
          page.missingDescriptions > 0 ||
          diagnostics.duplicates > 0
        if (!page.valid || page.totalCount !== diagnostics.totalCount) {
          incomplete = true
          diagnostics.stopReason = 'changing_pagination'
          break
        }
        if (index * 20 >= page.totalCount) break
        if (index === parameters.maxPages) {
          incomplete = true
          diagnostics.stopReason = 'page_limit'
        }
      }
      return incomplete
        ? { complete: false, reason: incompleteReason, diagnostics }
        : { complete: true, diagnostics }
    },
  }
}

// Preserve only bounded numeric/date Retry-After, never arbitrary response text.
function safeRetryAfter(error: unknown): string | null {
  const retry = error instanceof HimalayasHttpError ? error.retryAfter : null
  return retry &&
    retry.length <= 100 &&
    (/^\d+$/.test(retry) || Number.isFinite(Date.parse(retry)))
    ? retry
    : null
}
