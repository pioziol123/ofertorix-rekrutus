import { z } from 'zod'
import { saveDraft } from '../../../lib/profile/store'
import { database } from '../../utils/database'
import { profileBody, profileHandler } from '../../utils/profile'
export default profileHandler(async (event) => {
  const body = z
    .object({
      data: z.unknown(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(await profileBody(event))
  return saveDraft(database, body.data, body.expectedRevision)
})
