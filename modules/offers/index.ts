/**
 * Public operations of the Offers module (browsing job offers). API routes
 * and other modules use only these; views use `view.ts`.
 */
export { listOffers, type OfferList } from './list-offers.ts'
export { readOffer } from './read-offer.ts'
export { parseFilters, type Filters } from './domain/filters.ts'
export type { OfferView, Salary } from './offer-view.ts'
// Matching and Companies project source ads with it until task 0mq.6 moves
// the projection into the Sources read contract.
export { projectOffer } from './infrastructure/adapters/source-ad-projection.ts'
