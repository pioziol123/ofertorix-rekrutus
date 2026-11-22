import { setCurrentMonthLimit } from '../../../modules/ai/index'
import { setLimitFromBody } from '../../utils/ai-budget'
import { apiHandler } from '../../utils/http'

/**
 * The owner sets the limit of the current month (T13-R02); an invalid
 * amount answers 422 with its message (T13-R04).
 */
export default apiHandler((event) =>
  setLimitFromBody(event, (amount) => setCurrentMonthLimit(amount)),
)
