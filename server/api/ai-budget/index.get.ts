import { readBudget } from '../../../modules/ai/index'
import { apiHandler } from '../../utils/http'

/**
 * The AI assignments panel's budget view (T13-R01): the current month's
 * figures, the earlier months and the default limit (T13-R03).
 */
export default apiHandler(() => readBudget())
