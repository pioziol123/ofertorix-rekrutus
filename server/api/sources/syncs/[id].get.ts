import { readSyncDetails } from '../../../../modules/sources'
import { apiHandler } from '../../../utils/http'

/** One sync's details (T1-R12–R15); 404 for an unknown or malformed id. */
export default apiHandler(async (event) => {
  const details = await readSyncDetails(getRouterParam(event, 'id') ?? '')
  if (!details)
    throw createError({ statusCode: 404, statusMessage: 'Sync not found' })
  return details
})
