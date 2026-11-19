import { saveWeights } from '../../../modules/matching'
import { jsonBody } from '../../utils/http'
import { ratingHandler } from '../../utils/ratings'
export default ratingHandler(async (event) =>
  saveWeights(await jsonBody(event)),
)
