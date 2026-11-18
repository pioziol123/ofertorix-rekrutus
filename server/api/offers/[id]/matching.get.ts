import { readMatching } from '../../../../lib/matching/store'
import { database } from '../../../utils/database'
import { apiHandler, routeUuid } from '../../../utils/http'
export default apiHandler(async (event) =>
  readMatching(database, routeUuid(event)),
)
