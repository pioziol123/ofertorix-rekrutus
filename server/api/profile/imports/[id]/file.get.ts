import { uuid } from '../../../../../lib/profile/model'
import { originalFile } from '../../../../../lib/profile/imports'
import { database } from '../../../../utils/database'
import { profileHandler } from '../../../../utils/profile'
export default profileHandler(async (event) => {
  const file = await originalFile(
    database,
    uuid.parse(getRouterParam(event, 'id')),
  )
  if (!file)
    throw createError({ statusCode: 404, statusMessage: 'No source file' })
  setHeader(
    event,
    'Content-Type',
    file.kind === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="cv.${file.kind}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  )
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return send(event, file.bytes)
})
