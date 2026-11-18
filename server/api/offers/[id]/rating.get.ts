import { manualContext } from '../../../../lib/matching/ratings'
import { database } from '../../../utils/database'
import { routeUuid } from '../../../utils/http'
import { ratingHandler } from '../../../utils/ratings'
export default ratingHandler(async (event) =>
  manualContext(database, routeUuid(event)),
)
