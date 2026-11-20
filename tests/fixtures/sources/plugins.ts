/**
 * The plugins index of the Sources tests: the Sources module's job and
 * failure handler as its module plugin registers them, carried out with the
 * test connectors instead of the application's. The failure handler starts
 * 3 s late, so another job of the source can be taken before it ends its
 * sync, as when the worker is busy.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { runPlugins, type HandlerRegistry } from '../../../lib/workers/index.ts'
import {
  endFailedSyncRun,
  executeSyncRun,
  syncJob,
} from '../../../modules/sources/index.ts'
import { testConnectors } from './connectors.ts'

export async function runModulePlugins(registry: HandlerRegistry) {
  await runPlugins(
    {
      sources: (registry) =>
        registry.register(
          syncJob,
          (data) => executeSyncRun(data, testConnectors),
          async (data) => {
            await sleep(3_000)
            await endFailedSyncRun(data)
          },
        ),
    },
    registry,
  )
}
