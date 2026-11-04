import { uuid } from '../../../../lib/profile/model'
import { readBatchArchive } from '../../../../lib/matching/archive'
import { database } from '../../../utils/database'
import { profileHandler } from '../../../utils/profile'

export default profileHandler(async (event) => {
  const id = uuid.parse(getRouterParam(event, 'id'))
  const archive = await readBatchArchive(database, id)
  if (!archive)
    throw createError({
      statusCode: 404,
      statusMessage: 'Assessment not found',
    })
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="batch-${archive.operationId}.json"`,
  )
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return archive
})
