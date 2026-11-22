/**
 * The state of an operation (ZA-R02): pending, running, succeeded, failed
 * or uncertain. The one closed list of operation states in code; the
 * operation table checks its state column against the same values.
 */
export const operationStates = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'uncertain',
] as const
export type OperationState = (typeof operationStates)[number]

/** The states in which an operation has ended. */
export type EndedOperationState = Exclude<OperationState, 'pending' | 'running'>

/**
 * What a pending operation waits for: the budget or its executor. The one
 * closed list in code; the operation table checks its column against it.
 */
export const operationWaits = ['budget', 'executor'] as const
export type OperationWait = (typeof operationWaits)[number]

/** Whether an operation was added without the owner or by the owner. */
export type OperationOrigin = 'automatic' | 'manual'

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
