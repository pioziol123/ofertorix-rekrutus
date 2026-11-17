import { matchingListStatus } from '../../../lib/matching/list'
import { listOffers, parseFilters } from '../../../modules/offers'
import { syncStatus } from '../../../lib/sources/sync'
import { jobspyCatalogStatus } from '../../../lib/sources/jobspy-sync'
import { polishCatalogStatus } from '../../../lib/sources/polish-sync'
import { database } from '../../utils/database'
export default defineEventHandler(async (event) => {
  let filters
  try {
    filters = parseFilters(getQuery(event))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filters' })
  }
  const [list, sync, jobspy, polish, matching] = await Promise.all([
    listOffers(filters),
    syncStatus(database),
    jobspyCatalogStatus(database),
    polishCatalogStatus(database),
    matchingListStatus(database),
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
