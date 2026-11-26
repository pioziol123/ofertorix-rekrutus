/**
 * Public operations of the Offers module (browsing job offers). API routes
 * and other modules use only these; views use `view.ts`.
 */
export { listOffers, type OfferList } from './list-offers.ts'
export { readOffer } from './read-offer.ts'
export { parseFilters, type Filters } from './domain/filters.ts'
export type { OfferView, Salary } from './offer-view.ts'
export { OfferNotFound, startApplication } from './start-application.ts'
