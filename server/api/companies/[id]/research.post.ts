import { requestResearch } from '../../../../lib/companies/research'
import { companyHandler } from '../../../utils/companies'
import { jsonBody, queueClient } from '../../../utils/http'
export default companyHandler(async (event) =>
  requestResearch(
    await queueClient(),
    getRouterParam(event, 'id') ?? '',
    await jsonBody(event),
  ),
)
