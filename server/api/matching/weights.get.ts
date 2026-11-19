import { readWeights } from '../../../modules/matching'
import { ratingHandler } from '../../utils/ratings'
export default ratingHandler(async () => readWeights())
