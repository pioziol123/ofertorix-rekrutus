import { changeCompanyLink } from '../../../../lib/companies/store'
import { companyHandler } from '../../../utils/companies'
import { jsonBody } from '../../../utils/http'
export default companyHandler(async (event) =>
  changeCompanyLink(getRouterParam(event, 'id') ?? '', await jsonBody(event)),
)
