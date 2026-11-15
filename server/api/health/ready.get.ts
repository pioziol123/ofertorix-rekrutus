import { db } from '../../../lib/db'

export default defineEventHandler(async () => {
  try {
    await db().query('SELECT 1 FROM system_checks LIMIT 1')
    return { status: 'ready' }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service not ready' })
  }
})
