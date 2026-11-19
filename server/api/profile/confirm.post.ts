import { z } from 'zod'
import { confirmProfile } from '../../../modules/profile/index'
import { jsonBody, uuid } from '../../utils/http'
import { profileHandler } from '../../utils/profile'
export default profileHandler(async (event) => {
  const b = z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      expectedActiveVersionId: uuid.nullable(),
      commandId: uuid,
    })
    .strict()
    .parse(await jsonBody(event))
  return confirmProfile(
    b.expectedRevision,
    b.expectedActiveVersionId,
    b.commandId,
  )
})
