import type { SourceHealth, SyncHistoryPage } from '../../modules/sources/view'

/**
 * The read of the page "Synchronizacje" behind its list (T1, T4-R07):
 * every read of the list, on opening, on a changed filter or page, on
 * "Odśwież" and after a request of T3, also reads the summary strip and
 * the warning. The strip takes no history filter. A failure of the
 * history fails the read, and the page says it could not load the syncs;
 * a failure of the strip alone leaves the history, its filters and its
 * requests working and gives no strip.
 */
export type SyncPageData = {
  history: SyncHistoryPage
  /** Null when the strip could not be read. */
  health: SourceHealth | null
}

/** What the page fetches with: a JSON request of a path with a query. */
export type PageFetch = (
  path: string,
  options?: { query?: Record<string, unknown> },
) => Promise<unknown>

// ASSUMPTION(oferty-pracy-nq3.4/ASM-2): a strip that cannot be read leaves the history working and shows a notice in its place.
export async function readSyncPage(
  fetch: PageFetch,
  listQuery: Record<string, unknown>,
): Promise<SyncPageData> {
  const [history, health] = await Promise.all([
    fetch('/api/sources/syncs', { query: listQuery }),
    fetch('/api/sources/health').catch(() => null),
  ])
  return {
    history: history as SyncHistoryPage,
    health: health as SourceHealth | null,
  }
}
