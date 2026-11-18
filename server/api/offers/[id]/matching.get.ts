import { readMatching } from '../../../../lib/matching/store'
import { apiHandler, routeUuid } from '../../../utils/http'
export default apiHandler(async (event) => readMatching(routeUuid(event)))
