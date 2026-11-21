import type { OperationWork } from './declaration.ts'
import {
  nothingSent,
  unknownUsage,
  type ExecutorOutcome,
  type ExecutorUsage,
} from './outcome.ts'

/**
 * Shared mechanics of the executors: the maximum run time around one
 * operation, the writers that stop the work, and the usage measured so
 * far. Which outcome an event means stays in each executor's own code.
 */

/** A writer answered that the operation no longer runs, or failed. */
export class Stopped extends Error {
  constructor(options?: ErrorOptions) {
    super('The operation no longer runs', options)
  }
}

/**
 * The usage of one operation as its requests go: whether anything was
 * sent, and the counts measured. A request sent and not measured yet
 * leaves the usage unknown.
 */
export class Meter {
  private sent = false
  private sentBefore = false
  private unmeasured = false
  private inputTokens = 0
  private outputTokens = 0
  private toolCalls = 0
  /**
   * @param adjust turns the measured counts into the usage the provider
   * charges, e.g. a fixed block of tokens per paid tool call.
   */
  constructor(
    private adjust: (usage: ExecutorUsage) => ExecutorUsage = (usage) =>
      usage,
  ) {}
  /** A request is about to be sent. */
  sending() {
    this.sentBefore = this.sent
    this.sent = true
    this.unmeasured = true
  }
  /** The request about to be sent never left. */
  notSent() {
    this.sent = this.sentBefore
    this.unmeasured = false
  }
  /** The provider reported the usage of the request in flight. */
  measured(inputTokens: number, outputTokens: number, toolCalls = 0) {
    this.inputTokens += inputTokens
    this.outputTokens += outputTokens
    this.toolCalls += toolCalls
    this.unmeasured = false
  }
  /** The provider charges nothing for the request in flight. */
  notCharged() {
    this.unmeasured = false
  }
  get anythingSent() {
    return this.sent
  }
  usage(): ExecutorUsage {
    if (!this.sent) return nothingSent()
    if (this.unmeasured) return unknownUsage()
    return this.adjust({
      sent: true,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      toolCalls: this.toolCalls,
    })
  }
}

/** One request's signal: the run's, and the request's own limit. */
export type RequestSignal = {
  signal: AbortSignal
  /** Whether the request's limit or the run's maximum run time passed. */
  timedOut: () => boolean
  done: () => void
}

/** What an executor's body works with during one operation. */
export type Run = {
  meter: Meter
  /** Writes a request or a response; throws `Stopped` to stop the work. */
  exchange: (kind: 'request' | 'response', raw: string) => Promise<void>
  /** Saves the executor state; throws `Stopped` to stop the work. */
  saveState: (state: unknown) => Promise<void>
  /** A signal for one request, with its own limit when given. */
  request: (limitMs?: number) => RequestSignal
}

/**
 * Carries out an operation's body within the maximum run time (T2-R05).
 * When the time passes, every request in flight is aborted, the writers
 * stop answering, and the operation ends as an ordinary failure with the
 * cause `time_limit_run`, also when a provider ignores the abort. An error
 * the body does not translate is uncertain with the cause `unknown`, as is
 * a writer that answered no or failed: the outcome is discarded then by
 * the conditional end of the operation when it no longer runs.
 */
export async function withinMaxRunTime(
  maxRunSeconds: number,
  work: OperationWork,
  body: (run: Run) => Promise<ExecutorOutcome>,
  meter = new Meter(),
): Promise<ExecutorOutcome> {
  const run = new AbortController()
  const write = async (writer: () => Promise<boolean>) => {
    if (run.signal.aborted) throw new Stopped()
    let running: boolean
    try {
      running = await writer()
    } catch (cause) {
      throw new Stopped({ cause })
    }
    if (!running || run.signal.aborted) throw new Stopped()
  }
  const context: Run = {
    meter,
    exchange: (kind, raw) => write(() => work.exchange(kind, raw)),
    saveState: (state) => write(() => work.saveState(state)),
    request(limitMs) {
      const own = new AbortController()
      const timer =
        limitMs === undefined
          ? undefined
          : setTimeout(() => own.abort(), limitMs)
      return {
        signal: AbortSignal.any([run.signal, own.signal]),
        timedOut: () => own.signal.aborted || run.signal.aborted,
        done: () => clearTimeout(timer),
      }
    },
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeLimit = new Promise<ExecutorOutcome>((resolve) => {
    timer = setTimeout(() => {
      run.abort()
      resolve(timeLimitPassed(meter))
    }, maxRunSeconds * 1000)
  })
  const working = body(context).catch(
    (): ExecutorOutcome => ({
      kind: 'uncertain',
      cause: 'unknown',
      usage: meter.usage(),
    }),
  )
  try {
    return await Promise.race([working, timeLimit])
  } finally {
    clearTimeout(timer)
  }
}

/** The maximum run time, or a request's own limit, passed. */
export const timeLimitPassed = (meter: Meter): ExecutorOutcome => ({
  kind: 'failed',
  retryable: true,
  cause: 'time_limit_run',
  usage: meter.usage(),
})

/**
 * Codes of a connection error raised before a request left: the provider
 * could not be reached, so nothing was sent.
 */
const notSentCodes = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

/** Whether a transport error says the request never left. */
export function failedBeforeSending(error: unknown): boolean {
  const code = (value: unknown) =>
    value !== null && typeof value === 'object' && 'code' in value
      ? value.code
      : undefined
  const cause =
    error !== null && typeof error === 'object' && 'cause' in error
      ? error.cause
      : undefined
  return notSentCodes.has(String(code(error) ?? code(cause)))
}

/** The result content: JSON when a response format was given. */
export function resultContent(
  text: string,
  json: boolean,
): { content: unknown } | null {
  if (!json) return { content: text }
  try {
    return { content: JSON.parse(text) }
  } catch {
    return null
  }
}
