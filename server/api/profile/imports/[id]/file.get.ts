import { uuid } from '../../../../../lib/profile/model'
import { readOriginalFile } from '../../../../../modules/profile/index'
import { profileHandler } from '../../../../utils/profile'
export default profileHandler(async (event) => {
  const file = await readOriginalFile(uuid.parse(getRouterParam(event, 'id')))
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
