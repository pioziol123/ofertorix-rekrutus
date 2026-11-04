import { uuid } from '../../../../lib/profile/model'
import { saveManualRating } from '../../../../lib/matching/ratings'
import { database } from '../../../utils/database'
import { profileBody } from '../../../utils/profile'
import { ratingHandler } from '../../../utils/ratings'
export default ratingHandler(async (event) =>
  saveManualRating(
    database,
    uuid.parse(getRouterParam(event, 'id')),
    await profileBody(event),
  ),
)
