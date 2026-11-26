/**
 * Public operations of the Sources module (source ads, their versions and
 * their sync runs).
 * Entry points (worker, CLI scripts, API routes) and other modules use only
 * these.
 */
export { UnknownConnectorError } from './infrastructure/adapters/connector-registry.ts'
export {
  readSourceCatalog,
  readSyncState,
  type SourceSyncState,
  type SyncRunRecord,
} from './read-sync-state.ts'
export { readSyncDetails, readSyncHistory } from './read-sync-history.ts'
export { requestScheduledSyncs } from './request-scheduled-syncs.ts'
export {
  requestSync,
  SourceDisabledError,
  type SyncRequest,
} from './request-sync.ts'
export {
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

// Entry points: what the CLI scripts, the routes and the worker check or
// parse before they request a sync.
export { source as solidJobsSource } from './infrastructure/adapters/solid-jobs/api.ts'
export { source as himalayasSource } from './infrastructure/adapters/himalayas/api.ts'
export { parseJobspySource } from './domain/jobspy-catalog.ts'
export { jobspyEnabled } from './infrastructure/adapters/jobspy/runner.ts'
export {
  polishEnabled,
  polishQuery,
  sourceSchema as polishSourceSchema,
} from './infrastructure/adapters/polish/runner.ts'
export { currentScheduleDay } from './schedule-settings.ts'

// Composition: the server builds the connector registry at start.
export { sourceConnectors } from './infrastructure/adapters/source-connectors.ts'

// Composition: the job of carrying out a sync run, with the handlers the
// Sources module plugin registers for the worker, and the request the
// migration step makes for the runs the former queue held (B5-R08).
export {
  endFailedSyncRun,
  executeSyncRun,
  requestUnfinishedSyncRuns,
} from './execute-sync-run.ts'
export {
  syncJob,
  type SyncJobData,
} from './infrastructure/worker/sync-queue.ts'
