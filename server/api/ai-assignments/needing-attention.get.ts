import { countAssignmentsNeedingAttention } from '../../../modules/ai/index'
import { apiHandler } from '../../utils/http'

/** The number of AI assignments needing attention, for the navigation (T11-R04). */
export default apiHandler(async () => ({
  count: await countAssignmentsNeedingAttention(),
}))
