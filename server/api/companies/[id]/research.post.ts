import { requestResearch } from '../../../../modules/companies/index'
import { companyHandler } from '../../../utils/companies'
import { jsonBody, queueClient } from '../../../utils/http'
export default companyHandler(async (event) => {
  // The request sends the AI execution on the server's queue client.
  await queueClient()
  return requestResearch(
    getRouterParam(event, 'id') ?? '',
    await jsonBody(event),
  )
})
