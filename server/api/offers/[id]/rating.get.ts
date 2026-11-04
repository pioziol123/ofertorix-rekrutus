import { uuid } from '../../../../lib/profile/model'
import { manualContext } from '../../../../lib/matching/ratings'
import { database } from '../../../utils/database'
import { ratingHandler } from '../../../utils/ratings'
export default ratingHandler(async (event) =>
  manualContext(database, uuid.parse(getRouterParam(event, 'id'))),
)
