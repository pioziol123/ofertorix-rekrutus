import { readAssessmentExchange } from '../../../../modules/matching'
import { apiHandler, routeUuid } from '../../../utils/http'

export default apiHandler(async (event) => {
  const id = routeUuid(event)
  const exchange = await readAssessmentExchange(id)
  if (!exchange)
    throw createError({
      statusCode: 404,
      statusMessage: 'Assessment not found',
    })
  setHeader(
    event,
    'Content-Disposition',
    // ASSUMPTION(oferty-pracy-sq2.9/ASM-2): the file name of an exchange.
    `attachment; filename="exchange-${exchange.assignmentId}.json"`,
  )
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return exchange
})
