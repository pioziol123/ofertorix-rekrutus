import { readAssignmentDetails } from '../../../modules/ai/index'
import { apiHandler } from '../../utils/http'

/** The details of one AI assignment for the panel (T11-R03); 404 if unknown. */
export default apiHandler(async (event) => {
  const details = await readAssignmentDetails(getRouterParam(event, 'id') ?? '')
  if (!details)
    throw createError({
      statusCode: 404,
      statusMessage: 'Assignment not found',
    })
  return details
})
