import { readCompanyResearch } from '../../../../modules/companies/index'
import { companyHandler } from '../../../utils/companies'
export default companyHandler((event) =>
  readCompanyResearch(getRouterParam(event, 'id') ?? ''),
)
