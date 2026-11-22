import { rejectAssignment } from '../../../../modules/ai/index'
import { apiHandler } from '../../../utils/http'

/**
 * The owner's Reject of one AI assignment (T12-R03): whether it took effect
 * and the current status (T12-R04); 404 if unknown. A Reject that could not
 * be saved, e.g. because the requesting module's receiver raised an error,
 * answers with an error and changes nothing (T12-R06).
 */
export default apiHandler(async (event) => {
  const outcome = await rejectAssignment(getRouterParam(event, 'id') ?? '')
  if (!outcome)
    throw createError({
      statusCode: 404,
      statusMessage: 'Assignment not found',
    })
  return outcome
})
