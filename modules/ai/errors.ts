/**
 * Why AI refused an execution request:
 * - `not_configured`: the settings key has no settings, they are invalid,
 *   or the provider lacks its price list for the mode or its secret;
 * - `unsupported_mode`: no adapter of the chosen provider offers the mode;
 * - `operation_busy`: the operation already has an execution in progress;
 * - `invalid_request`: the request is incomplete.
 */
export type AiRequestErrorCode =
  'not_configured' | 'unsupported_mode' | 'operation_busy' | 'invalid_request'

export class AiRequestError extends Error {
  constructor(readonly code: AiRequestErrorCode) {
    super(`AI request refused: ${code}`)
  }
}
