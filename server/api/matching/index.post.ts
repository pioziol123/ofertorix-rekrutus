import { enqueueMatchingGroup } from '../../../lib/matching/groups'
import { MatchingError } from '../../../lib/matching/store'
import { database } from '../../utils/database'
import { profileHandler, profileBoss, profileBody } from '../../utils/profile'
export default profileHandler(async (event) => {
  const body = await profileBody(event)
  try {
    return await enqueueMatchingGroup(database, await profileBoss(), body)
  } catch (error) {
    if (error instanceof MatchingError)
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not start assessments',
        data: { message: error.message },
      })
    throw error
  }
})
