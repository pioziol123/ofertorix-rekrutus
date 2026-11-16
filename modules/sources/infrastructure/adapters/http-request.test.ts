import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConnectorAbortedError,
  ConnectorError,
  RetryDeferredError,
} from './connector.ts'
import { createHttpRequest, type Clock } from './http-request.ts'

/** A clock whose timers fire only when the test advances time. */
function fakeClock() {
  let now = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  let next = 0
  const clock: Clock = {
    now: () => now,
    setTimeout: (callback, ms) => {
      timers.set(++next, { at: now + ms, callback })
      return next
    },
    clearTimeout: (timer) => {
      timers.delete(timer as number)
    },
  }
  const advance = async (ms: number) => {
    const until = now + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].callback()
      await flush()
    }
    now = until
    await flush()
  }
  // Waits are simulated on the same clock.
  const sleep = async (ms: number) => {
    waits.push(ms)
    now += ms
  }
  const waits: number[] = []
  return { clock, advance, sleep, waits, time: () => now }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** A fetch that never answers and records when each attempt is aborted. */
function silentSource(time: () => number) {
  const aborted: number[] = []
  const fetcher = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => {
            aborted.push(time())
            reject(new DOMException('aborted', 'AbortError'))
          },
          { once: true },
        )
      }),
  )
  return { fetcher, aborted }
}

afterEach(() => vi.useRealTimers())

describe('HTTP request helper for connectors', () => {
  it('ends an unanswered request after 5 s and gives up after three attempts', async () => {
    const time = fakeClock()
    const { fetcher, aborted } = silentSource(time.time)
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    const pending = request('https://source.test/page')
    const outcome = expect(pending).rejects.toThrow(
      new ConnectorError('API network error or timeout after retry'),
    )
    await time.advance(5000)
    expect(aborted).toEqual([5000])
    await time.advance(20_000)
    await outcome
    expect(fetcher).toHaveBeenCalledTimes(3)
    // Each attempt waits 5 s; a retry follows a 1 s pause.
    expect(aborted).toEqual([5000, 11_000, 17_000])
  })

  it('makes three attempts for a transient status and returns the last answer', async () => {
    const time = fakeClock()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('busy', { status: 503 }))
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    const response = await request('https://source.test/page')
    expect(response).toMatchObject({ status: 503, ok: false })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(time.waits).toEqual([1000, 1000])
  })

  it('makes one attempt for a permanent status', async () => {
    const time = fakeClock()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('missing', { status: 404 }))
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    expect(await request('https://source.test/page')).toMatchObject({
      status: 404,
      ok: false,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(time.waits).toEqual([])
  })

  it('reports a Retry-After beyond 60 s as a deferred retry', async () => {
    const time = fakeClock()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 429,
        headers: { 'Retry-After': '120' },
      }),
    )
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    const error = await request('https://source.test/page').catch((e) => e)
    expect(error).toBeInstanceOf(RetryDeferredError)
    expect(error).toBeInstanceOf(ConnectorError)
    expect(error).toMatchObject({
      message: 'API HTTP 429; retry deferred',
      status: 429,
      retryAfter: '120',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('waits for Retry-After, then succeeds with the body', async () => {
    const time = fakeClock()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }))
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    const response = await request('https://source.test/page')
    expect(JSON.parse(response.body.toString('utf8'))).toEqual({ ok: true })
    expect(time.waits).toEqual([30_000])
  })

  it('waits at least 1 s before a retry, even when Retry-After is shorter', async () => {
    const time = fakeClock()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', { status: 503, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(Response.json({}))
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    expect(await request('https://source.test')).toMatchObject({ ok: true })
    expect(time.waits).toEqual([1000])
  })

  it('makes no retry that could not end before the deadline', async () => {
    const time = fakeClock()
    const limited = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
      )
    const request = createHttpRequest({
      label: 'API',
      fetch: limited,
      sleep: time.sleep,
      clock: time.clock,
    })
    // 30 s wait + 5 s attempt would end at 35 s, past the 20 s deadline.
    expect(
      await request('https://source.test', {}, undefined, {
        deadlineAt: 20_000,
      }),
    ).toMatchObject({ status: 429, ok: false })
    expect(limited).toHaveBeenCalledTimes(1)
    expect(time.waits).toEqual([])

    const failing = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network'))
    const failingRequest = createHttpRequest({
      label: 'API',
      fetch: failing,
      sleep: time.sleep,
      clock: time.clock,
    })
    await expect(
      failingRequest('https://source.test', {}, undefined, {
        deadlineAt: time.time() + 3000,
      }),
    ).rejects.toThrow('API network error or timeout after retry')
    expect(failing).toHaveBeenCalledTimes(1)

    // A retry that fits is still made.
    const busy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({}))
    const busyRequest = createHttpRequest({
      label: 'API',
      fetch: busy,
      sleep: time.sleep,
      clock: time.clock,
    })
    expect(
      await busyRequest('https://source.test', {}, undefined, {
        deadlineAt: time.time() + 6000,
      }),
    ).toMatchObject({ ok: true })
    expect(busy).toHaveBeenCalledTimes(2)
  })

  it('uses the 5 s limit and two retries by default, both configurable', async () => {
    vi.useFakeTimers()
    const { fetcher, aborted } = silentSource(() => Date.now())
    const started = Date.now()
    const request = createHttpRequest({
      label: 'Source',
      fetch: fetcher,
      sleep: async () => {},
      timeoutMs: 2000,
      retries: 0,
    })
    const outcome = expect(request('https://source.test')).rejects.toThrow(
      'Source network error or timeout after retry',
    )
    await vi.advanceTimersByTimeAsync(2000)
    await outcome
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(aborted.map((at) => at - started)).toEqual([2000])
  })

  it('stops with an abort error when the caller aborts', async () => {
    const time = fakeClock()
    const { fetcher } = silentSource(time.time)
    const request = createHttpRequest({
      label: 'API',
      fetch: fetcher,
      sleep: time.sleep,
      clock: time.clock,
    })
    const controller = new AbortController()
    const pending = request('https://source.test', {}, controller.signal)
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(ConnectorAbortedError)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
