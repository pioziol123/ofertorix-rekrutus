import { createError } from 'h3'
import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import { ProfileConflict } from '../../modules/profile/index'
import { AiRequestError } from '../../modules/ai/index'
import { apiHandler } from './http'
/** A Profile route: the shared handling plus the Profile's own errors. */
export function profileHandler<T>(run: (event: H3Event) => Promise<T>) {
  return apiHandler(async (event) => {
    try {
      return await run(event)
    } catch (error) {
      if (error instanceof AiRequestError)
        throw createError({
          statusCode: error.code === 'provider_unavailable' ? 503 : 422,
          statusMessage: 'AI unavailable; check server configuration and model',
          data: { code: error.code },
        })
      if (error instanceof ProfileConflict)
        throw createError({
          statusCode: 409,
          statusMessage: 'Profile changed in another tab; reload to compare',
        })
      if (error instanceof ZodError)
        throw createError({
          statusCode: 422,
          statusMessage: 'Check profile values',
          data: {
            issues: error.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          },
        })
      if (error && typeof error === 'object' && 'statusCode' in error)
        throw error
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not complete profile operation',
      })
    }
  })
}
