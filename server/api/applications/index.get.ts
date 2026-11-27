import { readApplicationsPageOverHttp } from '../../../modules/recruitments/index'
import { recruitmentRoute } from '../../utils/recruitments'

/**
 * One page of Moja lista (lq3 T2). The query holds the page's address:
 * `stage`, `page` and `size`; a value the read cannot use gives its default.
 */
export default recruitmentRoute(async (event) =>
  readApplicationsPageOverHttp(getQuery(event)),
)
