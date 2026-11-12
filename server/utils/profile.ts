import {
  defineEventHandler,
  createError,
  getHeader,
  getRequestURL,
  setHeader,
} from 'h3'
import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import { createBoss } from '../../lib/queue'
import { ProfileConflict } from '../../lib/profile/store'
import { ModelError } from '../../lib/ai/models/model'
let bossPromise: Promise<ReturnType<typeof createBoss>> | undefined
export function profileBoss() {
  bossPromise ??= (async () => {
    const boss = createBoss()
    boss.on('error', () => console.error('Profile queue unavailable'))
    await boss.start()
    return boss
  })().catch((error) => {
    bossPromise = undefined
    throw error
  })
  return bossPromise
}
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
export async function profileBody(event: H3Event): Promise<unknown> {
  if (!getHeader(event, 'content-type')?.startsWith('application/json'))
    throw createError({ statusCode: 415, statusMessage: 'Expected JSON' })
  const bytes = await limitedBytes(event, 2 * 1024 * 1024)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Invalid JSON' })
  }
}
export function profileHandler<T>(run: (event: H3Event) => Promise<T>) {
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
      if (error instanceof ModelError)
        throw createError({
          statusCode: error.code === 'configuration' ? 422 : 503,
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
