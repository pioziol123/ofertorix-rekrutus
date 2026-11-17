/**
 * Public entry of the Offers module for views. Views run in the browser, so
 * this entry reaches no server code: no database, queue or Node built-ins.
 * Server code uses `index.ts`.
 */
export { offerFilterQuery, hasSalaryFilter } from './domain/filter-form.ts'
export type { OfferView, Salary } from './offer-view.ts'
