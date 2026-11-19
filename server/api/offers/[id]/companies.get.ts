import { offerCompanies } from '../../../../modules/companies/index'
import { companyHandler } from '../../../utils/companies'
export default companyHandler(async (event) => {
  const result = await offerCompanies(getRouterParam(event, 'id') ?? '')
  if (!result)
    throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  return result
})
