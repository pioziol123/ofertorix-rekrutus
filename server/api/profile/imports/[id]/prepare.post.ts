import { z } from 'zod'
import { uuid } from '../../../../../lib/profile/model'
import { prepareProposal } from '../../../../../modules/profile/index'
import {
  profileBody,
  profileBoss,
  profileHandler,
} from '../../../../utils/profile'
export default profileHandler(async (event) => {
  const body = z
    .object({
      text: z.string().min(1).max(120000),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(await profileBody(event))
  // Connects the AI execution queue before the request.
  await profileBoss()
  return prepareProposal(
    uuid.parse(getRouterParam(event, 'id')),
    body.text,
    body.expectedRevision,
  )
})
