import { changeCompanyLink } from '../../../../lib/companies/store'
import { database } from '../../../utils/database'
import { companyHandler } from '../../../utils/companies'
import { profileBody } from '../../../utils/profile'
export default companyHandler(async (event) =>
  changeCompanyLink(
    database,
    getRouterParam(event, 'id') ?? '',
    await profileBody(event),
  ),
)
