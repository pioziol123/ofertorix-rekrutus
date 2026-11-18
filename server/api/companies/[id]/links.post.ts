import { changeCompanyLink } from '../../../../lib/companies/store'
import { database } from '../../../utils/database'
import { companyHandler } from '../../../utils/companies'
import { jsonBody } from '../../../utils/http'
export default companyHandler(async (event) =>
  changeCompanyLink(
    database,
    getRouterParam(event, 'id') ?? '',
    await jsonBody(event),
  ),
)
