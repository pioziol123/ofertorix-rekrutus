import {
  defineEventHandler,
  createError,
  getHeader,
  getRequestURL,
  getRouterParam,
  setHeader,
} from 'h3'
import type { H3Event } from 'h3'
import { z, ZodError } from 'zod'

/**
 * Request handling shared by the API routes of every module: identifier
 * validation, the request body limit and parsing and mapping exceptions to
 * response codes. It knows no module's
 * rules; a module's route utility maps that module's exceptions on top.
 */

/** A UUID, as identifiers in route parameters and request bodies are. */
export const uuid = z.string().uuid()

/** A route parameter that must be a UUID; another value fails with 422. */
export function routeUuid(event: H3Event, name = 'id'): string {
  return uuid.parse(getRouterParam(event, name))
}

/** The raw request body, refused with 413 above `limit` bytes. */
export async function limitedBytes(
  event: H3Event,
  limit: number,
): Promise<Buffer> {
  if (Number(getHeader(event, 'content-length') ?? '0') > limit)
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of event.node.req.iterator({
    destroyOnReturn: false,
  })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += bytes.length
    if (length > limit) {
      event.node.req.resume()
      throw createError({ statusCode: 413, statusMessage: 'Request too large' })
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

/** A JSON request body of at most 2 MiB. */
export async function jsonBody(event: H3Event): Promise<unknown> {
  if (!getHeader(event, 'content-type')?.startsWith('application/json'))
    throw createError({ statusCode: 415, statusMessage: 'Expected JSON' })
  const bytes = await limitedBytes(event, 2 * 1024 * 1024)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Invalid JSON' })
  }
}

/**
 * An API route that is never cached and accepts a change only from the
 * application's own origin. An error that already carries a response code
 * passes through with its status, message and data, invalid input gives 422 with its issues, and any other
 * error gives 422 without details.
 */
export function apiHandler<T>(run: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event) => {
    setHeader(event, 'Cache-Control', 'no-store')
    if (event.method !== 'GET') {
      const origin = getHeader(event, 'origin')
      if (
        origin !==
        getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
          .origin
      )
        throw createError({ statusCode: 403, statusMessage: 'Origin rejected' })
    }
    try {
      return await run(event)
    } catch (error) {
      // An error that carries a response code passes through as the
      // framework's own error, so its status, message and data reach the
      // response; one of another kind would be answered as unhandled.
      if (error && typeof error === 'object' && 'statusCode' in error)
        throw createError(error)
      if (error instanceof ZodError)
        throw createError({
          statusCode: 422,
          statusMessage: 'Check the submitted values',
          data: {
            issues: error.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          },
        })
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not complete the operation',
      })
    }
  })
}
