import { z } from 'zod'
import { saveDraft } from '../../../modules/profile/index'
import { jsonBody } from '../../utils/http'
import { profileHandler } from '../../utils/profile'
export default profileHandler(async (event) => {
  const body = z
    .object({
      data: z.unknown(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(await jsonBody(event))
  return saveDraft(body.data, body.expectedRevision)
})
