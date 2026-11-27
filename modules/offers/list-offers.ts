import { decorateMatching } from '../matching/index.ts'
import { readCurrentStages } from '../recruitments/index.ts'
import { filterOffers } from './domain/filter-offers.ts'
import type { Filters } from './domain/filters.ts'
import { readOffers } from './read-offers.ts'

/** One page of the offer list with its totals and filter options. */
export type OfferList = ReturnType<typeof filterOffers>

/**
 * Lists the offers matching the filters, sorted and paged. Each offer
 * carries the summary of its matching assessment, which the assessment
 * filters and the rating sort use before paging, and the stage of its
 * application, which the stage filter uses before paging (lq3 T3-R04).
 * The stages come from one read of every application (lq3 D3), so the
 * list sends the same queries whatever the number of applications.
 */
export async function listOffers(filters: Filters): Promise<OfferList> {
  const [offers, stages] = await Promise.all([
    readOffers(),
    readCurrentStages(),
  ])
  const withStages = offers.map((offer) => {
    const stage = stages.get(offer.id)
    return stage ? { ...offer, stage } : offer
  })
  // Until task 0mq.18 the list uses Matching's existing read.
  return filterOffers(await decorateMatching(withStages), filters)
}
