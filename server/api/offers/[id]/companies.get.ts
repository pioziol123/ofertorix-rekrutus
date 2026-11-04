import { offerCompanies } from '../../../../lib/companies/store'
import { database } from '../../../utils/database'
import { companyHandler } from '../../../utils/companies'
export default companyHandler(async (event) => {
  const result = await offerCompanies(
    database,
    getRouterParam(event, 'id') ?? '',
  )
  if (!result)
    throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  return result
})
