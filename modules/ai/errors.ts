/**
 * Why AI refused an execution request or the check before it:
 * - `not_configured`: the settings key has no settings, they are invalid,
 *   or the provider lacks its price list for the mode, its secret or its
 *   runtime configuration;
 * - `provider_unavailable`: the check before a request could not confirm
 *   that the provider can take the work now;
 * - `unsupported_mode`: no adapter of the chosen provider offers the mode;
 * - `operation_busy`: the operation already has an execution in progress;
 * - `input_too_large`: the input of a paid request is larger than the
 *   input cap of its price list, for a request that asks to be refused
 *   then, or a batch item (ASSUMPTION(oferty-pracy-0mq.21/ASM-5));
 * - `batch_too_large`: the provider's batch cannot take the group: too
 *   many items or bytes for one batch (ASSUMPTION(oferty-pracy-0mq.21/ASM-4));
 * - `invalid_request`: the request is incomplete, or its check belongs to
 *   other settings, or a group request names a group already requested
 *   (ASSUMPTION(oferty-pracy-0mq.21/ASM-7)).
 */
export type AiRequestErrorCode =
  | 'not_configured'
  | 'provider_unavailable'
  | 'unsupported_mode'
  | 'operation_busy'
  | 'input_too_large'
  | 'batch_too_large'
  | 'invalid_request'

export class AiRequestError extends Error {
  constructor(readonly code: AiRequestErrorCode) {
    super(`AI request refused: ${code}`)
  }
}
