import { matchingListStatus } from '../../../modules/matching'
import { listOffers, parseFilters } from '../../../modules/offers'
export default defineEventHandler(async (event) => {
  let filters
  try {
    filters = parseFilters(getQuery(event))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filters' })
  }
  const list = await listOffers(filters)
  // The assessment status of the offers the list shows.
  const matching = await matchingListStatus(list.items.map((offer) => offer.id))
  return { ...list, matching }
})
