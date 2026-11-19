import { matchingListStatus } from '../../../lib/matching/list'
import { listOffers, parseFilters } from '../../../modules/offers'
import { readSourceCatalog, readSyncState } from '../../../modules/sources'
import { solidJobsSource as solidJobs } from '../../../modules/sources'
export default defineEventHandler(async (event) => {
  let filters
  try {
    filters = parseFilters(getQuery(event))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filters' })
  }
  const [list, sync, { jobspy, polish }, matching] = await Promise.all([
    listOffers(filters),
    readSyncState({ source: solidJobs, scope: {} }),
    readSourceCatalog(),
    matchingListStatus(),
  ])
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
