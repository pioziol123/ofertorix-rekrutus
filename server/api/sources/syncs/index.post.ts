import { z } from 'zod'
import {
  InvalidPanelSyncRequestError,
  requestPanelSyncs,
} from '../../../../modules/sources'
import { apiHandler, limitedBytes } from '../../../utils/http'

const body = z.object({ sources: z.array(z.string()) }).strict()

const malformed = () =>
  createError({ statusCode: 400, statusMessage: 'Invalid sync request' })

/**
 * Requests syncs of the checked sources from the page "Synchronizacje"
 * (T3). The body is `{ "sources": [<source id>, ...] }`; the answer gives
 * each source's outcome and the counts. A body that is not such JSON, an
 * empty list or one longer than the catalogue gives 400.
 */
export default apiHandler(async (event) => {
  if (!getHeader(event, 'content-type')?.startsWith('application/json'))
    throw createError({ statusCode: 415, statusMessage: 'Expected JSON' })
  const bytes = await limitedBytes(event, 8192)
  let sources: string[]
  try {
    sources = body.parse(JSON.parse(bytes.toString('utf8'))).sources
  } catch {
    throw malformed()
  }
  try {
    return await requestPanelSyncs(sources)
  } catch (error) {
    if (error instanceof InvalidPanelSyncRequestError) throw malformed()
    throw error
  }
})
