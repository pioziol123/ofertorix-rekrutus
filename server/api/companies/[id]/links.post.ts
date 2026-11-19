import { changeCompanyLink } from '../../../../modules/companies/index'
import { companyHandler } from '../../../utils/companies'
import { jsonBody } from '../../../utils/http'
export default companyHandler(async (event) =>
  changeCompanyLink(getRouterParam(event, 'id') ?? '', await jsonBody(event)),
)
