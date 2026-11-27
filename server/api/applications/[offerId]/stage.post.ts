import { moveApplicationOverHttp } from '../../../../modules/recruitments/index'
import { recruitmentBody, recruitmentRoute } from '../../../utils/recruitments'
export default recruitmentRoute(async (event) =>
  moveApplicationOverHttp(
    getRouterParam(event, 'offerId'),
    await recruitmentBody(event),
  ),
)
