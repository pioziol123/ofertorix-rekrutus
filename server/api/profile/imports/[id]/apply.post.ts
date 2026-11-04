import { z } from 'zod'
import {
  applyProposal,
  checkProposal,
  uuid,
} from '../../../../../lib/profile/model'
import {
  readProfile,
  saveDraft,
  ProfileConflict,
} from '../../../../../lib/profile/store'
import { database } from '../../../../utils/database'
import { profileBody, profileHandler } from '../../../../utils/profile'
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
    .parse(await profileBody(event))
  const id = uuid.parse(getRouterParam(event, 'id'))
  const imported = (
    await database.query(
      "SELECT * FROM profile_imports WHERE id=$1 AND status='proposal'",
      [id],
    )
  ).rows[0]
  if (!imported)
    throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
  const current = await readProfile(database)
  if (current.draft.revision !== body.expectedRevision)
    throw new ProfileConflict('Draft changed')
  const proposal = checkProposal(imported.proposal, imported.professional_text)
  const next = applyProposal(
    current.draft.data,
    proposal,
    body,
    id,
    imported.text_revision,
  )
  return saveDraft(database, next, body.expectedRevision)
})
