import { polishQuery } from '../../../lib/sources/polish'
import { requestSync, SourceDisabledError } from '../../../modules/sources'
import { limitedBytes, queueClient } from '../../utils/http'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (
    getHeader(event, 'origin') !==
    getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
      .origin
  )
    throw createError({ statusCode: 403, statusMessage: 'Origin rejected' })
  if (!getHeader(event, 'content-type')?.startsWith('application/json'))
    throw createError({ statusCode: 415, statusMessage: 'Expected JSON' })
  const bytes = await limitedBytes(event, 8192)
  let query
  try {
    query = polishQuery.parse(JSON.parse(bytes.toString('utf8')))
  } catch {
    throw createError({
      statusCode: 422,
      statusMessage: 'Invalid import criteria',
    })
  }
  try {
    await queueClient()
    const run = await requestSync({ source: query.source, scopeRequest: query })
    return { id: run.id, reused: run.existing }
  } catch (error) {
    if (error instanceof SourceDisabledError)
      throw createError({ statusCode: 409, statusMessage: 'Source disabled' })
    throw createError({
      statusCode: 503,
      statusMessage: 'Could not queue source import',
    })
  }
})
