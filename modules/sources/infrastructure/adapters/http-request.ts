import { setTimeout as delay } from 'node:timers/promises'
import {
  ConnectorError,
  RetryDeferredError,
  throwIfAborted,
} from './connector.ts'

/** Timers and time, injectable so tests can run on a fake clock. */
export type Clock = {
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(timer: unknown): void
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

export type HttpRequestOptions = {
  /** Prefix of error messages, e.g. `API` gives `API HTTP 503; ...`. */
  label: string
  /** Per-attempt limit for the response, body included. */
  timeoutMs?: number
  /** Retries after the first attempt; at most `retries + 1` attempts. */
  retries?: number
  /** Body size limit of a successful response. */
  maxBytes?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<unknown>
  clock?: Clock
}

export type HttpResponse = {
  status: number
  ok: boolean
  headers: Headers
  /** The body of a successful response; empty otherwise. */
  body: Buffer
}

export const defaultTimeoutMs = 5000
export const defaultRetries = 2
const defaultRetryWaitMs = 1000
const maxRetryWaitMs = 60_000

/**
 * HTTP requests for connectors that talk to their source directly.
 *
 * Network errors, timeouts, HTTP 429 and 5xx are retried. Before a retry the
 * helper waits for `Retry-After`, at least 1 s. A `Retry-After` beyond 60 s
 * ends with `RetryDeferredError`. Repeated network errors end with a
 * `ConnectorError`; any other status, or the last retryable one, is returned
 * to the caller.
 */
export function createHttpRequest(options: HttpRequestOptions) {
  const {
    label,
    timeoutMs = defaultTimeoutMs,
    retries = defaultRetries,
    maxBytes,
    clock = systemClock,
  } = options
  const sleep = options.sleep ?? ((ms: number) => delay(ms))
  return async (
    url: URL | string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<HttpResponse> => {
    const fetcher = options.fetch ?? fetch
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal)
      const last = attempt >= retries
      const attemptSignal = new AbortController()
      const abort = () => attemptSignal.abort()
      const timer = clock.setTimeout(abort, timeoutMs)
      signal?.addEventListener('abort', abort, { once: true })
      let response: Response | undefined
      try {
        response = await fetcher(url, {
          ...init,
          signal: attemptSignal.signal,
        })
        if (response.ok)
          return {
            status: response.status,
            ok: true,
            headers: response.headers,
            body: await readBody(response, label, maxBytes),
          }
      } catch (error) {
        throwIfAborted(signal)
        if (error instanceof ConnectorError) throw error
        response = undefined
      } finally {
        clock.clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      if (!response) {
        if (last)
          throw new ConnectorError(
            `${label} network error or timeout after retry`,
          )
        await sleep(defaultRetryWaitMs)
        continue
      }
      await response.body?.cancel().catch(() => {})
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || last)
        return {
          status: response.status,
          ok: false,
          headers: response.headers,
          body: Buffer.alloc(0),
        }
      const retryAfter = response.headers.get('retry-after')
      const wait = retryWait(retryAfter, clock.now())
      // Do not retry earlier than Retry-After when it exceeds our waiting budget.
      if (!Number.isFinite(wait) || wait > maxRetryWaitMs)
        throw new RetryDeferredError(label, response.status, retryAfter)
      await sleep(Math.max(defaultRetryWaitMs, wait))
    }
  }
}

function retryWait(retryAfter: string | null, now: number): number {
  if (retryAfter === null) return defaultRetryWaitMs
  const seconds = Number(retryAfter)
  return Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(retryAfter) - now
}

// Bound response buffering even when Content-Length is missing or incorrect.
async function readBody(
  response: Response,
  label: string,
  maxBytes: number | undefined,
): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (maxBytes !== undefined && size > maxBytes)
        throw new ConnectorError(`${label} response too large`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}
