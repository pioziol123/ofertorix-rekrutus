import { listCompanies } from '../../../modules/companies/index'
import { companyHandler } from '../../utils/companies'
export default companyHandler((event) => listCompanies(getQuery(event)))
