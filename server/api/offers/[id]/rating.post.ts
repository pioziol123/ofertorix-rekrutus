import { saveManualRating } from '../../../../lib/matching/ratings'
import { database } from '../../../utils/database'
import { jsonBody, routeUuid } from '../../../utils/http'
import { ratingHandler } from '../../../utils/ratings'
export default ratingHandler(async (event) =>
  saveManualRating(
    database,
    routeUuid(event),
    await jsonBody(event),
  ),
)
