import { readSyncHistory } from '../../../../modules/sources'
import { apiHandler } from '../../../utils/http'

/**
 * One page of the sync history (T1). The query holds the page's address:
 * `source` and `state` (repeated or comma-separated), `trigger`, `period`,
 * `page` and `size`; a value the read cannot use gives its default (T1-R17).
 */
export default apiHandler(async (event) => readSyncHistory(getQuery(event)))
