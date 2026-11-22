import { readAssignmentList } from '../../../modules/ai/index'
import { apiHandler } from '../../utils/http'

/**
 * One page of the AI assignments panel's list (T11-R02); `cursor` is the
 * `nextCursor` of the page before. A cursor the list did not give returns
 * an empty page.
 */
export default apiHandler(async (event) => {
  const { cursor } = getQuery(event)
  return readAssignmentList(typeof cursor === 'string' ? cursor : null)
})
