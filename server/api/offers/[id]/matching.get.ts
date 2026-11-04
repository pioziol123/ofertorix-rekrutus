import { uuid } from '../../../../lib/profile/model'
import { readMatching } from '../../../../lib/matching/store'
import { database } from '../../../utils/database'
import { profileHandler } from '../../../utils/profile'
export default profileHandler(async (event) =>
  readMatching(database, uuid.parse(getRouterParam(event, 'id'))),
)
