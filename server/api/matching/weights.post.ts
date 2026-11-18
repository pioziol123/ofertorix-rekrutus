import { saveWeights } from '../../../lib/matching/ratings'
import { database } from '../../utils/database'
import { jsonBody } from '../../utils/http'
import { ratingHandler } from '../../utils/ratings'
export default ratingHandler(async (event) =>
  saveWeights(database, await jsonBody(event)),
)
