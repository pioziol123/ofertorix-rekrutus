import { moveApplicationOverHttp } from '../../../../modules/recruitments/index'
import { jsonBody } from '../../../utils/http'
import { recruitmentRoute } from '../../../utils/recruitments'
export default recruitmentRoute(async (event) =>
  moveApplicationOverHttp(
    getRouterParam(event, 'offerId'),
    await jsonBody(event),
  ),
)
