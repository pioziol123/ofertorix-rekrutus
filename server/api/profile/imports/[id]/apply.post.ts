import { z } from 'zod'
import {
  applyProposal,
  ProposalNotFound,
} from '../../../../../modules/profile/index'
import { jsonBody, uuid } from '../../../../utils/http'
import { profileHandler } from '../../../../utils/profile'
export default profileHandler(async (event) => {
  const selected = z
    .array(z.number().int().nonnegative())
    .max(150)
    .refine((v) => new Set(v).size === v.length)
  const body = z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      skills: selected,
      experience: selected,
      summary: z.boolean(),
      skillTargets: z.record(z.string(), uuid).optional(),
      experienceTargets: z.record(z.string(), uuid).optional(),
    })
    .strict()
    .parse(await jsonBody(event))
  const importId = uuid.parse(getRouterParam(event, 'id'))
  try {
    return await applyProposal({ importId, ...body })
  } catch (error) {
    if (error instanceof ProposalNotFound)
      throw createError({
        statusCode: 404,
        statusMessage: 'Proposal not found',
      })
    throw error
  }
})
