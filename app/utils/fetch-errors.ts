/**
 * How a page reads a failed request. Pure, so tests check it without a
 * browser or a server.
 */

/**
 * Whether a request failed because the server answered 404, that is the
 * thing asked for does not exist. Any other failure (a server error, a
 * dropped connection) is not a 404: the page must say it could not read the
 * data instead of acting as if there were none (T1-R16).
 */
export function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { statusCode, status, response } = error as {
    statusCode?: unknown
    status?: unknown
    response?: { status?: unknown }
  }
  return (statusCode ?? status ?? response?.status) === 404
}
