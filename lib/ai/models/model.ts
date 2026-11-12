export type ModelRequest = {
  model: string
  instructions: string
  input: string
  output: { name: string; schema: Record<string, unknown> }
}
export type ModelUsage = {
  inputTokens: number | null
  outputTokens: number | null
}
export type ModelResult = {
  outcome: 'completed' | 'refused' | 'incomplete'
  text: string | null
  usage: ModelUsage
  responseId: string | null
}
export type StructuredModel = {
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResult>
}
export type ModelErrorCode =
  | 'configuration'
  | 'network'
  | 'http'
  | 'format'
  | 'aborted'
  | 'model_unavailable'
  | 'context_overflow'
export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    readonly details: {
      requestSent?: boolean
      responseReceived?: boolean
      httpStatus?: number
      retryAfterMs?: number | null
      responseId?: string | null
      usage?: ModelUsage
      runtimeEnded?: boolean
    } = {},
    options?: ErrorOptions,
  ) {
    super(`AI ${code}`, options)
  }
}
export const emptyUsage = (): ModelUsage => ({
  inputTokens: null,
  outputTokens: null,
})
export const tokenCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export function validateRequest(request: ModelRequest) {
  if (
    !request.model?.trim() ||
    !request.instructions?.trim() ||
    !request.input?.trim() ||
    !request.output?.name?.trim() ||
    !Object.keys(record(request.output.schema)).length
  )
    throw new ModelError('configuration')
}
