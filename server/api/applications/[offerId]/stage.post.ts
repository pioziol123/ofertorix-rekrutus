import { moveApplicationOverHttp } from '../../../../modules/recruitments/index'
import { apiHandler, jsonBody } from '../../../utils/http'
export default apiHandler(async (event) =>
  moveApplicationOverHttp(
    getRouterParam(event, 'offerId'),
    await jsonBody(event),
  ),
)
