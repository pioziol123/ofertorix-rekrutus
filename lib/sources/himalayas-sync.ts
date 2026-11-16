import { source } from './himalayas.ts'
import { scheduleDay } from './solid.ts'
import { runSyncInProcess } from '../../modules/sources/index.ts'
import type { ConnectorProvider } from '../../modules/sources/infrastructure/adapters/connector-registry.ts'
import { sourceConnectors } from '../../modules/sources/infrastructure/adapters/source-connectors.ts'

// Manual pilot only: no scheduler and no queue. Until 0mq.16 the CLI runs it
// with the shared executor in its own process (A5-R08).
export async function syncHimalayas(
  connectors: ConnectorProvider = sourceConnectors,
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
