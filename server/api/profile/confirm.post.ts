import { z } from 'zod'
import { confirmProfile } from '../../../lib/profile/store'
import { uuid } from '../../../lib/profile/model'
import { database } from '../../utils/database'
import { profileBody, profileHandler } from '../../utils/profile'
export default profileHandler(async (event) => {
  const b = z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      expectedActiveVersionId: uuid.nullable(),
      commandId: uuid,
    })
    .strict()
    .parse(await profileBody(event))
  return confirmProfile(
    database,
    b.expectedRevision,
    b.expectedActiveVersionId,
    b.commandId,
  )
})
