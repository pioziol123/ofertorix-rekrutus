/**
 * Why AI refused an execution request:
 * - `not_configured`: the job type has no valid provider and price list;
 * - `unsupported_mode`: the configured execution does not offer the mode;
 * - `executor_unavailable`: the configured provider cannot run here yet;
 * - `operation_busy`: the operation already has an execution in progress;
 * - `invalid_request`: the request is incomplete.
 */
export type AiRequestErrorCode =
  | 'not_configured'
  | 'unsupported_mode'
  | 'executor_unavailable'
  | 'operation_busy'
  | 'invalid_request'

export class AiRequestError extends Error {
  constructor(readonly code: AiRequestErrorCode) {
    super(`AI request refused: ${code}`)
  }
}
