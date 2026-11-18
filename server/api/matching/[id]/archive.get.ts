import { readBatchArchive } from '../../../../lib/matching/archive'
import { database } from '../../../utils/database'
import { apiHandler, routeUuid } from '../../../utils/http'

export default apiHandler(async (event) => {
  const id = routeUuid(event)
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
