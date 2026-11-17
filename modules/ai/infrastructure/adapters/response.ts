import { ModelError } from '../../provider-adapter.ts'
import type { ModelRequest } from '../../provider-adapter.ts'

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
