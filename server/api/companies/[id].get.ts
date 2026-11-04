import { readCompany } from '../../../lib/companies/store'
import { database } from '../../utils/database'
import { companyHandler } from '../../utils/companies'
export default companyHandler(async (event) => {
  const result = await readCompany(database, getRouterParam(event, 'id') ?? '')
  if (!result)
    throw createError({ statusCode: 404, statusMessage: 'Company not found' })
  return result
})
