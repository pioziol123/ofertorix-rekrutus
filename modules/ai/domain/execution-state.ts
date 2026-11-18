/**
 * The public stages of an execution, the same for every provider.
 * - `waiting_budget`, `queued`, `running` and `delivering` are in progress:
 *   an operation has at most one execution in one of them. `delivering`
 *   holds a saved outcome the client's receiver has not taken over yet.
 * - `completed` and `rejected` end with the client's decision on a result.
 * - `failed` ends without a result, and AI knows how the work ended.
 * - `uncertain` ends without a result, and AI cannot tell how the work
 *   ended: it keeps what it reserved for it (the budget or the shared
 *   local slot), and a person checks the execution before trying again.
 * - `retried` ended with an error worth another attempt, which is a new
 *   execution of the same operation.
 */
export const executionStates = [
  'waiting_budget',
  'queued',
  'running',
  'delivering',
  'uncertain',
  'completed',
  'rejected',
  'failed',
  'retried',
] as const
export type ExecutionState = (typeof executionStates)[number]

/** The stages in which an execution is still in progress. */
export const inProgressStates = [
  'waiting_budget',
  'queued',
  'running',
  'delivering',
] as const satisfies readonly ExecutionState[]

/**
 * Why an execution ended without a result, the same for every provider:
 * - `refused`: the model refused the work;
 * - `incomplete`: the model stopped before a complete response;
 * - `no_content`: the response held no single usable content;
 * - `format`: the content is not JSON or does not match the response schema,
 *   or the response could not be read;
 * - `configuration`: the provider or its runtime is not configured;
 * - `network`: the provider could not be reached or the connection broke;
 * - `http`: the provider answered with an error;
 * - `aborted`: the work was stopped;
 * - `model_unavailable`: the model is not available at the provider;
 * - `context_overflow`: the input does not fit the model's context;
 * - `adapter_unavailable`: no adapter could take the work;
 * - `interrupted`: the work lost its runner while it ran;
 * - `unknown`: anything else.
 */
export const executionCauses = [
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
  'adapter_unavailable',
  'interrupted',
  'unknown',
] as const
export type ExecutionCause = (typeof executionCauses)[number]

/** An end without a result, as an adapter decides it. */
export type ExecutionEnd = {
  state: 'failed' | 'uncertain'
  cause: ExecutionCause
}

export function isExecutionCause(value: unknown): value is ExecutionCause {
  return (executionCauses as readonly unknown[]).includes(value)
}
