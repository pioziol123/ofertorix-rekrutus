import { readBatchArchive } from '../../../../modules/matching'
import { apiHandler, routeUuid } from '../../../utils/http'

export default apiHandler(async (event) => {
  const id = routeUuid(event)
  const archive = await readBatchArchive(id)
  if (!archive)
    throw createError({
      statusCode: 404,
      statusMessage: 'Assessment not found',
    })
  setHeader(
    event,
    'Content-Disposition',
    // ASSUMPTION(oferty-pracy-sq2.9/ASM-2): the file name of an exchange.
    archive.kind === 'exchange'
      ? `attachment; filename="exchange-${archive.assignmentId}.json"`
      : `attachment; filename="batch-${archive.operationId}.json"`,
  )
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return archive
})
