import { z } from 'zod'
import { uuid } from '../../../../../lib/profile/model'
import { prepareProposal } from '../../../../../lib/profile/ai'
import { database } from '../../../../utils/database'
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
  return prepareProposal(
    database,
    await profileBoss(),
    uuid.parse(getRouterParam(event, 'id')),
    body.text,
    body.expectedRevision,
  )
})
