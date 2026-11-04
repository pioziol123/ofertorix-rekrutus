import { requestResearch } from '../../../../lib/companies/research'
import { database } from '../../../utils/database'
import { companyHandler } from '../../../utils/companies'
import { profileBody, profileBoss } from '../../../utils/profile'
export default companyHandler(async (event) =>
  requestResearch(
    database,
    await profileBoss(),
    getRouterParam(event, 'id') ?? '',
    await profileBody(event),
  ),
)
