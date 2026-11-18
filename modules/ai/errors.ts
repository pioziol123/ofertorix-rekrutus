/**
 * Why AI refused an execution request or the check before it:
 * - `not_configured`: the settings key has no settings, they are invalid,
 *   or the provider lacks its price list for the mode, its secret or its
 *   runtime configuration;
 * - `provider_unavailable`: the check before a request could not confirm
 *   that the provider can take the work now;
 * - `unsupported_mode`: no adapter of the chosen provider offers the mode;
 * - `operation_busy`: the operation already has an execution in progress;
 * - `invalid_request`: the request is incomplete, or its check belongs to
 *   other settings.
 */
export type AiRequestErrorCode =
  | 'not_configured'
  | 'provider_unavailable'
  | 'unsupported_mode'
  | 'operation_busy'
  | 'invalid_request'

export class AiRequestError extends Error {
  constructor(readonly code: AiRequestErrorCode) {
    super(`AI request refused: ${code}`)
  }
}
