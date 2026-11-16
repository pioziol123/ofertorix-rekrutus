import { source } from './himalayas.ts'
import { scheduleDay } from './solid.ts'
import { runSyncInProcess } from '../../modules/sources/index.ts'

// Manual pilot only: no scheduler and no queue. Until 0mq.16 the CLI runs it
// with the shared executor in its own process (A5-R08).
export async function syncHimalayas(
  /** Tests replace the application's connectors. */
  connectors?: Parameters<typeof runSyncInProcess>[1],
  signal: AbortSignal = new AbortController().signal,
) {
  const run = await runSyncInProcess(
    { source, scheduleDay: scheduleDay(), signal },
    connectors,
  )
  return {
    id: run.id,
    status: run.status,
    seen: run.uniqueAds,
    revisions: run.revisions,
    pages: run.pages,
    error: run.error,
    diagnostics: run.diagnostics as Record<string, unknown> | null,
  }
}
