import { readApplicationOverHttp } from '../../../modules/recruitments/index'
import { recruitmentRoute } from '../../utils/recruitments'
export default recruitmentRoute(async (event) =>
  readApplicationOverHttp(getRouterParam(event, 'offerId')),
)
