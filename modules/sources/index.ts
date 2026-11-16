/**
 * Public operations of the Sources module (source ads and their sync runs).
 * Entry points (worker, CLI scripts, API routes) use only these.
 */
export {
  executeSyncRun,
  SyncRunLostError,
  type SyncRunWork,
} from './execute-sync-run.ts'
export { recoverSyncRuns, type SyncJobLookup } from './recover-sync-runs.ts'
export {
  runSyncInProcess,
  SyncRunAlreadyActiveError,
} from './run-sync-in-process.ts'
export { syncJobOptions } from './sync-job-options.ts'
export type { SyncRun, SyncRunStatus } from './sync-run-state.ts'
