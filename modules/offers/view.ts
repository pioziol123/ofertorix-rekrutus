/**
 * Public entry of the Offers module for views. Views run in the browser, so
 * this entry reaches no server code: no database, queue or Node built-ins.
 * Server code uses `index.ts`.
 */
export { offerFilterQuery, hasSalaryFilter } from './domain/filter-form.ts'
export {
  listStageIcon,
  readStageFilter,
  stageFilterOptions,
  type StageFilterValue,
} from './domain/stage-filter.ts'
export {
  salaryLabel,
  salaryOriginLabel,
  salaryPeriodLabel,
  salaryTermsLabel,
} from './domain/salary-label.ts'
export type { OfferSummary, OfferView, Salary } from './offer-view.ts'
