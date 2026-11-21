/**
 * The causes of an operation that ended without a result, one closed list
 * of the AI module, the same for every executor (solution design of epic
 * sq2, "Contract: the closed lists"). The operation table checks its cause
 * column against it.
 * - `refused`: the model refused the work;
 * - `incomplete`: the answer stopped before it was complete;
 * - `no_content`: the answer held no single usable content;
 * - `format`: the content or the response could not be read;
 * - `configuration`: a secret or address is missing, or the provider
 *   cannot take the request at all;
 * - `network`: the provider could not be reached or the connection broke;
 * - `http`: the provider answered with a rate limit or a server error;
 * - `aborted`: the work was stopped;
 * - `model_unavailable`: the model is not available at the provider;
 * - `context_overflow`: the input does not fit the model's context;
 * - `unknown`: anything else;
 * - `not_started`: a pending operation ended with its assignment;
 * - `time_limit_run`: the maximum run time, or a request's own limit,
 *   passed.
 */
export const operationCauses = [
  'refused',
  'incomplete',
  'no_content',
  'format',
  'configuration',
  'network',
  'http',
  'aborted',
  'model_unavailable',
  'context_overflow',
  'unknown',
  'not_started',
  'time_limit_run',
] as const
export type OperationCause = (typeof operationCauses)[number]

/** The causes an executor reports; `not_started` is assignment handling's. */
export type ExecutorCause = Exclude<OperationCause, 'not_started'>

/**
 * The usage an executor knows: the input tokens, the output tokens and the
 * calls of a paid tool, each a count or null when unknown, and whether
 * anything was sent to the provider (T2-R04).
 */
export type ExecutorUsage = {
  sent: boolean
  inputTokens: number | null
  outputTokens: number | null
  toolCalls: number | null
}

/**
 * The one outcome of an operation (T2-R03): a result, an ordinary failure
 * (`retryable`), a non-retryable failure, or uncertain when the executor
 * cannot tell how the work ended. The content of a result is a JSON value
 * when the assignment gave a response format, otherwise the text.
 */
export type ExecutorOutcome =
  | { kind: 'result'; content: unknown; usage: ExecutorUsage }
  | {
      kind: 'failed'
      retryable: boolean
      cause: ExecutorCause
      usage: ExecutorUsage
    }
  | { kind: 'uncertain'; cause: ExecutorCause; usage: ExecutorUsage }

/** Nothing was sent: the usage of a cost of zero. */
export const nothingSent = (): ExecutorUsage => ({
  sent: false,
  inputTokens: 0,
  outputTokens: 0,
  toolCalls: 0,
})

/** Something was sent whose usage is not known. */
export const unknownUsage = (): ExecutorUsage => ({
  sent: true,
  inputTokens: null,
  outputTokens: null,
  toolCalls: null,
})
