import { enqueueMatchingGroup } from '../../../lib/matching/groups'
import { MatchingError } from '../../../lib/matching/store'
import { database } from '../../utils/database'
import { apiHandler, jsonBody, queueClient } from '../../utils/http'
export default apiHandler(async (event) => {
  const body = await jsonBody(event)
  try {
    return await enqueueMatchingGroup(database, await queueClient(), body)
  } catch (error) {
    if (error instanceof MatchingError)
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not start assessments',
        data: { message: error.message },
      })
    throw error
  }
})
