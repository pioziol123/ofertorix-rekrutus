import { enqueueMatching, MatchingError } from '../../../../modules/matching'
import {
  apiHandler,
  jsonBody,
  queueClient,
  routeUuid,
} from '../../../utils/http'
import { z } from 'zod'
export default apiHandler(async (event) => {
  const id = routeUuid(event)
  z.object({})
    .strict()
    .parse(await jsonBody(event))
  try {
    // Connects the AI execution queue before the request.
    await queueClient()
    return await enqueueMatching(id)
  } catch (error) {
    if (error instanceof MatchingError)
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not start assessment',
        data: { message: error.message },
      })
    throw error
  }
})
