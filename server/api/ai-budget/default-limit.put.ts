import { setDefaultLimit } from '../../../modules/ai/index'
import { setLimitFromBody } from '../../utils/ai-budget'
import { apiHandler } from '../../utils/http'

/**
 * The owner sets the limit a new month starts with (T13-R03); an invalid
 * amount answers 422 with its message (T13-R04).
 */
export default apiHandler((event) => setLimitFromBody(event, setDefaultLimit))
