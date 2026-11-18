import { z } from 'zod'
import {
  importCvDocument,
  importCvText,
} from '../../../../modules/profile/index'
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
    id = await importCvText(body.text)
  } else {
    const name = z.string().min(1).max(200).parse(getQuery(event).name)
    if (!/\.(pdf|docx)$/i.test(name))
      throw createError({ statusCode: 415, statusMessage: 'Only PDF and DOCX' })
    id = await importCvDocument(
      name,
      await limitedBytes(event, 10 * 1024 * 1024),
      await profileBoss(),
    )
  }
  setResponseStatus(event, 202)
  return { id }
})
