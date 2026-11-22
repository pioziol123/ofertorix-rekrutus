import { retryAssignment } from '../../../../modules/ai/index'
import { apiHandler } from '../../../utils/http'

/**
 * The owner's Retry of one AI assignment (T12-R01): whether it took effect
 * and the current status (T12-R04); 404 if unknown.
 */
export default apiHandler(async (event) => {
  const outcome = await retryAssignment(getRouterParam(event, 'id') ?? '')
  if (!outcome)
    throw createError({
      statusCode: 404,
      statusMessage: 'Assignment not found',
    })
  return outcome
})
