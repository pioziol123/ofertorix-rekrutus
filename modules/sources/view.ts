/**
 * Public entry of the Sources module for views. Views run in the browser, so
 * this entry reaches no server code: no database, queue or Node built-ins.
 * Server code uses `index.ts`.
 */
export type { PolishSource } from './domain/polish-catalog.ts'
export {
  remoteEligibilityLabel,
  type RemoteEligibility,
} from './domain/remote-eligibility.ts'
export { sourceName } from './domain/source-names.ts'
export {
  changeFilters,
  changePageSize,
  choiceOnClose,
  clearFilters,
  filtersAtDefault,
  historyAddress,
  pageSizes,
  showPage,
  syncStates,
  type PageSize,
  type SyncDetails,
  type SyncHistoryFilters,
  type SyncHistoryPage,
  type SyncHistoryQuery,
  type SyncPeriod,
  type SyncState,
  type SyncTrigger,
} from './domain/sync-history.ts'
export {
  choiceSummary,
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
export type { PanelSyncResult } from './domain/panel-syncs.ts'
export {
  afterRequestQuery,
  canConfirm,
  dialogSources,
  dialogTitles,
  initiallyChecked,
  listReadFor,
  requestFailure,
  requestSummary,
  rerunOffered,
  rerunOutcome,
  unansweredRequest,
  type DialogPreset,
  type DialogSource,
} from './domain/sync-requests-view.ts'
