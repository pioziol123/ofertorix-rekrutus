import { saveManualRating } from '../../../../lib/matching/ratings'
import { jsonBody, routeUuid } from '../../../utils/http'
import { ratingHandler } from '../../../utils/ratings'
export default ratingHandler(async (event) =>
  saveManualRating(routeUuid(event), await jsonBody(event)),
)
