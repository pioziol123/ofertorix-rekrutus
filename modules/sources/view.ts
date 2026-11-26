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
  defaultFilters,
  defaultPageSize,
  filtersAtDefault,
  historyAddress,
  pageSizes,
  readHistoryQuery,
  showPage,
  syncStates,
  type CatalogSource,
  type PageSize,
  type SyncDetails,
  type SyncHistoryFilters,
  type SyncHistoryItem,
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
  escapeCloses,
  groupByDay,
  pageJumpKey,
  pageJumpNumbers,
  periodChoices,
  rowResult,
  rowTime,
  stateIcons,
  stateLabels,
  stateTooltips,
  syncCourse,
  syncProblem,
  tooltipPosition,
  triggerChoices,
  triggerIcons,
  triggerTooltips,
  type PageJump,
} from './domain/sync-history-view.ts'
