import { uuid } from '../../../../lib/profile/model'
import { enqueueMatching, MatchingError } from '../../../../lib/matching/store'
import { database } from '../../../utils/database'
import {
  profileHandler,
  profileBoss,
  profileBody,
} from '../../../utils/profile'
import { z } from 'zod'
export default profileHandler(async (event) => {
  const id = uuid.parse(getRouterParam(event, 'id'))
  z.object({})
    .strict()
    .parse(await profileBody(event))
  try {
    return await enqueueMatching(database, await profileBoss(), id)
  } catch (error) {
    if (error instanceof MatchingError)
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not start assessment',
        data: { message: error.message },
      })
    throw error
  }
})
