import { createError } from 'h3'
import type { H3Event } from 'h3'
import { RefusalResponse } from '../../modules/recruitments/index'
import { apiHandler } from './http'

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
