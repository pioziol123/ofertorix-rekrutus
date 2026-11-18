import { z } from 'zod'
import { uuid } from '../../../lib/profile/model'
import { confirmProfile } from '../../../modules/profile/index'
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
    b.expectedRevision,
    b.expectedActiveVersionId,
    b.commandId,
  )
})
