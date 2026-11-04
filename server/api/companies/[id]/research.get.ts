import { readCompanyResearch } from '../../../../lib/companies/research'
import { database } from '../../../utils/database'
import { companyHandler } from '../../../utils/companies'
export default companyHandler((event) =>
  readCompanyResearch(database, getRouterParam(event, 'id') ?? ''),
)
