import type { H3Event } from 'h3'
import { createError } from 'h3'
import { ZodError } from 'zod'
import { RatingConflict } from '../../lib/matching/ratings'
import { profileHandler } from './profile'
export function ratingHandler<T>(run: (event: H3Event) => Promise<T>) {
  return profileHandler(async (event) => {
    try {
      return await run(event)
    } catch (error) {
      if (error instanceof RatingConflict)
        throw createError({
          statusCode: 409,
          statusMessage: 'Assessment changed',
          data: { message: error.message },
        })
      if (error instanceof ZodError)
        throw createError({
          statusCode: 422,
          statusMessage: 'Invalid rating values',
          data: { message: 'Sprawdź wartości ocen, uzasadnienia i sumę wag.' },
        })
      throw error
    }
  })
}
