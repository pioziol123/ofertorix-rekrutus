/**
 * Public operations of the Sources module (source ads, their versions and
 * their sync runs).
 * Entry points (worker, CLI scripts, API routes) and other modules use only
 * these.
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
export {
  readAdVersionList,
  readAdVersions,
  readCurrentAds,
  readCurrentAdVersions,
} from './read-source-ads.ts'
export {
  missingAdCompany,
  missingAdTitle,
  type CurrentAdVersion,
  type Salary,
  type SourceAd,
  type SourceAdContent,
  type SourceAdVersion,
} from './source-ad.ts'
