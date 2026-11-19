import { createCompany } from '../../../modules/companies/index'
import { companyHandler } from '../../utils/companies'
import { jsonBody } from '../../utils/http'
export default companyHandler(async (event) =>
  createCompany(await jsonBody(event)),
)
