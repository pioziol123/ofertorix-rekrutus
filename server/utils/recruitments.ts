import { createError } from 'h3'
import type { H3Event } from 'h3'
import { RefusalResponse } from '../../modules/recruitments/index'
import { apiHandler, jsonBody } from './http'

/**
 * The JSON body of a Recruitments request. A body that is not JSON, or is
 * sent without the JSON content type, is malformed input and answers 422
 * with the code `invalid_input` (D13); a body over the size limit keeps the
 * shared answer 413.
 */
export async function recruitmentBody(event: H3Event): Promise<unknown> {
  try {
    return await jsonBody(event)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 415 || status === 422)
      throw new RefusalResponse(422, 'invalid_input')
    throw error
  }
}

/**
 * An API route of the Recruitments module. The module's HTTP handler
 * answers a refusal with its status and code (D13); this turns that answer
 * into the framework's error, so the code reaches the response body.
 */
export function recruitmentRoute<T>(run: (event: H3Event) => Promise<T>) {
  return apiHandler(async (event) => {
    try {
      return await run(event)
    } catch (error) {
      if (error instanceof RefusalResponse)
        throw createError({
          statusCode: error.statusCode,
          statusMessage: error.statusMessage,
          data: error.data,
        })
      throw error
    }
  })
}
