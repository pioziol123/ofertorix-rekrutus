import type { SourceHealth, SyncHistoryPage } from '../../modules/sources/view'

/**
 * The one read of the page "Synchronizacje" behind its list (T1, T4-R07):
 * every read of the list, on opening, on a changed filter or page, on
 * "Odśwież" and after a request of T3, also reads the summary strip and
 * the warning. The strip takes no history filter. A failure of either
 * read fails the whole read, and the page says it could not load.
 */
export type SyncPageData = { history: SyncHistoryPage; health: SourceHealth }

/** What the page fetches with: a JSON request of a path with a query. */
export type PageFetch = (
  path: string,
  options?: { query?: Record<string, unknown> },
) => Promise<unknown>

// ASSUMPTION(oferty-pracy-nq3.4/ASM-2): a failed read of the strip fails the read of the list, and the page shows its notice.
export async function readSyncPage(
  fetch: PageFetch,
  listQuery: Record<string, unknown>,
): Promise<SyncPageData> {
  const [history, health] = await Promise.all([
    fetch('/api/sources/syncs', { query: listQuery }),
    fetch('/api/sources/health'),
  ])
  return {
    history: history as SyncHistoryPage,
    health: health as SourceHealth,
  }
}
