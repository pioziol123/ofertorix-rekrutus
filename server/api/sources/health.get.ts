import { readSourceHealth } from '../../../modules/sources'
import { apiHandler } from '../../utils/http'

/**
 * Source health of the page "Synchronizacje" (T4): the counts of the
 * summary strip and the warning list. It takes no input; the history's
 * filters do not change it (T4-R07).
 */
export default apiHandler(async () => readSourceHealth())
