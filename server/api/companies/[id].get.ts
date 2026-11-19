import { readCompany } from '../../../modules/companies/index'
import { companyHandler } from '../../utils/companies'
export default companyHandler(async (event) => {
  const result = await readCompany(getRouterParam(event, 'id') ?? '')
  if (!result)
    throw createError({ statusCode: 404, statusMessage: 'Company not found' })
  return result
})
