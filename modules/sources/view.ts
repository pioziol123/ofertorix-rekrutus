/**
 * Public entry of the Sources module for views. Views run in the browser, so
 * this entry reaches no server code: no database, queue or Node built-ins.
 * Server code uses `index.ts`.
 */
export {
  remoteEligibilityLabel,
  type RemoteEligibility,
} from './domain/remote-eligibility.ts'
export { sourceName } from './domain/source-names.ts'
export {
  changeFilters,
  clearFilters,
  filtersAtDefault,
  historyAddress,
  syncStates,
  type SyncDetails,
  type SyncHistoryFilters,
  type SyncHistoryPage,
  type SyncHistoryQuery,
  type SyncPeriod,
  type SyncState,
  type SyncTrigger,
} from './domain/sync-history.ts'
export {
  detailNumbers,
  emptyHistoryText,
  groupByDay,
  periodChoices,
  rowResult,
  rowTime,
  stateIcons,
  stateLabels,
  stateTooltips,
  syncCourse,
  syncProblem,
  triggerChoices,
  triggerIcons,
  triggerTooltips,
  type UnavailableContext,
} from './domain/sync-history-view.ts'
export { panelScopeText, type PanelSyncResult } from './domain/panel-syncs.ts'
export {
  afterRequestQuery,
  canConfirm,
  dialogSources,
  dialogTitles,
  initiallyChecked,
  requestFailure,
  requestSummary,
  rerunOffered,
  rerunOutcome,
  unansweredRequest,
  type DialogPreset,
  type DialogSource,
} from './domain/sync-requests-view.ts'
export {
  healthFailureText,
  shownWarnings,
  stripCounts,
  warningHeading,
  warningQuery,
  warningReasons,
} from './domain/source-health-view.ts'
export type { HealthWarning, SourceHealth } from './domain/source-health.ts'
