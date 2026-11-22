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
