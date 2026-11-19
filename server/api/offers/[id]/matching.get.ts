import { readMatching } from '../../../../modules/matching'
import { apiHandler, routeUuid } from '../../../utils/http'
export default apiHandler(async (event) => readMatching(routeUuid(event)))
