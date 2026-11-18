import { decorateMatching } from '../../lib/matching/list.ts'
import { filterOffers } from './domain/filter-offers.ts'
import type { Filters } from './domain/filters.ts'
import { readOffers } from './read-offers.ts'

/** One page of the offer list with its totals and filter options. */
export type OfferList = ReturnType<typeof filterOffers>

/**
 * Lists the offers matching the filters, sorted and paged. Each offer
 * carries the summary of its matching assessment, which the assessment
 * filters and the rating sort use before paging.
 */
export async function listOffers(filters: Filters): Promise<OfferList> {
  const offers = await readOffers()
  // Until task 0mq.18 the list uses Matching's existing read.
  return filterOffers(await decorateMatching(offers), filters)
}
