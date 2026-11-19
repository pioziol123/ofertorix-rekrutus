import { manualContext } from '../../../../modules/matching'
import { routeUuid } from '../../../utils/http'
import { ratingHandler } from '../../../utils/ratings'
export default ratingHandler(async (event) => manualContext(routeUuid(event)))
