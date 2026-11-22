import { matchingListStatus } from '../../../modules/matching'
import { listOffers, parseFilters } from '../../../modules/offers'
import {
  readSourceCatalog,
  readSyncState,
  solidJobsSource as solidJobs,
} from '../../../modules/sources'
export default defineEventHandler(async (event) => {
  let filters
  try {
    filters = parseFilters(getQuery(event))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filters' })
  }
  const [list, sync, { jobspy, polish }] = await Promise.all([
    listOffers(filters),
    readSyncState({ source: solidJobs, scope: {} }),
    readSourceCatalog(),
  ])
  // The list's refresh follows the assessments of the offers it shows.
  const matching = await matchingListStatus(list.items.map((offer) => offer.id))
  return {
    ...list,
    matching,
    jobspy,
    polish,
    sync: {
      run: sync.run ? { status: String(sync.run.status) } : null,
      lastComplete: sync.lastComplete
        ? { finished_at: String(sync.lastComplete.finished_at) }
        : null,
    },
  }
})
