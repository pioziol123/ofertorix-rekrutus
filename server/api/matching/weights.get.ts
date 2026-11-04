import { readWeights } from '../../../lib/matching/ratings'
import { database } from '../../utils/database'
import { ratingHandler } from '../../utils/ratings'
export default ratingHandler(async () => readWeights(database))
