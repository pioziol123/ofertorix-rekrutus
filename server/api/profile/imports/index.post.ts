import { z } from 'zod'
import {
  createFileImport,
  createTextImport,
} from '../../../../lib/profile/imports'
import { database } from '../../../utils/database'
import {
  profileBody,
  profileBoss,
  profileHandler,
  limitedBytes,
} from '../../../utils/profile'
export default profileHandler(async (event) => {
  let id: string
  if (getHeader(event, 'content-type')?.startsWith('application/json')) {
    const body = z
      .object({ text: z.string().trim().min(1).max(120000) })
      .strict()
      .parse(await profileBody(event))
    id = await createTextImport(database, body.text)
  } else {
    const name = z.string().min(1).max(200).parse(getQuery(event).name)
    if (!/\.(pdf|docx)$/i.test(name))
      throw createError({ statusCode: 415, statusMessage: 'Only PDF and DOCX' })
    id = await createFileImport(
      database,
      await profileBoss(),
      name,
      await limitedBytes(event, 10 * 1024 * 1024),
    )
  }
  setResponseStatus(event, 202)
  return { id }
})
