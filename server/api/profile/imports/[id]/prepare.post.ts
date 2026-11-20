import { z } from 'zod'
import { prepareProposal } from '../../../../../modules/profile/index'
import { jsonBody, uuid } from '../../../../utils/http'
import { profileHandler } from '../../../../utils/profile'
export default profileHandler(async (event) => {
  const body = z
    .object({
      text: z.string().min(1).max(120000),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(await jsonBody(event))
  return prepareProposal(
    uuid.parse(getRouterParam(event, 'id')),
    body.text,
    body.expectedRevision,
  )
})
