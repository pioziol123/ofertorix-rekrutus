import { createCompany } from '../../../lib/companies/store'
import { database } from '../../utils/database'
import { companyHandler } from '../../utils/companies'
import { jsonBody } from '../../utils/http'
export default companyHandler(async (event) =>
  createCompany(database, await jsonBody(event)),
)
