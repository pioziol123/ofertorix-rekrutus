import { saveWeights } from '../../../lib/matching/ratings'
import { database } from '../../utils/database'
import { profileBody } from '../../utils/profile'
import { ratingHandler } from '../../utils/ratings'
export default ratingHandler(async (event) =>
  saveWeights(database, await profileBody(event)),
)
