import { requestResearch } from '../../../../lib/companies/research'
import { database } from '../../../utils/database'
import { companyHandler } from '../../../utils/companies'
import { jsonBody, queueClient } from '../../../utils/http'
export default companyHandler(async (event) =>
  requestResearch(
    database,
    await queueClient(),
    getRouterParam(event, 'id') ?? '',
    await jsonBody(event),
  ),
)
