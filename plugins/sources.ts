/**
 * The Sources module plugin: registers carrying out a sync run with its job
 * handler and its failure handler, which ends the run after the last
 * attempt failed (B5-R05).
 */
import type { HandlerRegistry } from '../lib/workers/index.ts'
import {
  endFailedSyncRun,
  executeSyncRun,
  syncJob,
} from '../modules/sources/index.ts'

export function registerSourcesJobs(registry: HandlerRegistry): void {
  registry.register(syncJob, (data) => executeSyncRun(data), endFailedSyncRun)
}
