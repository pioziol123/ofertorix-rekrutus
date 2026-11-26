import { describe, expect, it } from 'vitest'
import { isNotFound } from '../app/utils/fetch-errors.ts'

/** The details read of the page "Synchronizacje" (T1-R16, T1-AC08). */

/** The shape of the error a failed `$fetch` throws. */
function fetchError(status?: number) {
  return Object.assign(new Error('request failed'), {
    status,
    statusCode: status,
  })
}

describe('a failed details read (T1-R16, T1-AC08)', () => {
  it('counts a 404 answer as a sync that does not exist', () => {
    expect(isNotFound(fetchError(404))).toBe(true)
    expect(isNotFound({ response: { status: 404 } })).toBe(true)
  })

  it('does not take a server error or a dropped connection for a missing sync', () => {
    expect(isNotFound(fetchError(500))).toBe(false)
    expect(isNotFound(fetchError(503))).toBe(false)
    expect(isNotFound(fetchError())).toBe(false)
    expect(isNotFound(new TypeError('fetch failed'))).toBe(false)
    expect(isNotFound(null)).toBe(false)
    expect(isNotFound('404')).toBe(false)
  })
})
