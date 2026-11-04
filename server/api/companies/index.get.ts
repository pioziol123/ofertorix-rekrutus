import { listCompanies } from '../../../lib/companies/store'
import { database } from '../../utils/database'
import { companyHandler } from '../../utils/companies'
export default companyHandler((event) =>
  listCompanies(database, getQuery(event)),
)
