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
