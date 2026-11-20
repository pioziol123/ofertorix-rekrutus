/**
 * The plugins index of the Sources tests: the Sources module's job and
 * failure handler as its module plugin registers them, carried out with the
 * test connectors instead of the application's.
 */
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
          endFailedSyncRun,
        ),
    },
    registry,
  )
}
