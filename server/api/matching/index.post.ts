import { enqueueMatchingGroup, MatchingError } from '../../../modules/matching'
import { apiHandler, jsonBody } from '../../utils/http'
export default apiHandler(async (event) => {
  const body = await jsonBody(event)
  try {
    return await enqueueMatchingGroup(body)
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
