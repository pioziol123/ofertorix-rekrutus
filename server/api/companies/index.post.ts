import { createCompany } from '../../../lib/companies/store'
import { database } from '../../utils/database'
import { companyHandler } from '../../utils/companies'
import { profileBody } from '../../utils/profile'
export default companyHandler(async (event) =>
  createCompany(database, await profileBody(event)),
)
