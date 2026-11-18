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
export { UnknownConnectorError } from './infrastructure/adapters/connector-registry.ts'
export {
  findSyncJob,
  syncQueue,
  syncQueueOptions,
  useSyncQueue,
  workSyncQueue,
  type SyncJobLookup,
} from './infrastructure/worker/sync-queue.ts'
export {
  readSourceCatalog,
  readSyncState,
  type SourceSyncState,
  type SyncRunRecord,
} from './read-sync-state.ts'
export { recoverSyncRuns } from './recover-sync-runs.ts'
export { requestScheduledSyncs } from './request-scheduled-syncs.ts'
export {
  requestSync,
  SourceDisabledError,
  type SyncRequest,
} from './request-sync.ts'
export {
  AdmittedRunFinishedError,
  type AdmittedRun,
  type SyncRun,
  type SyncRunStatus,
} from './sync-run-state.ts'
export { waitForSyncRun } from './wait-for-sync-run.ts'
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
