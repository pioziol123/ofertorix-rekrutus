import { readApplicationOverHttp } from '../../../modules/recruitments/index'
import { apiHandler } from '../../utils/http'
export default apiHandler(async (event) =>
  readApplicationOverHttp(getRouterParam(event, 'offerId')),
)
