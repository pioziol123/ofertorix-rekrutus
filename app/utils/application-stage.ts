import { refusalText } from '../../modules/recruitments/view'
import { isNotFound, refusalCodeOf } from './fetch-errors'

/**
 * What the stage field of offer details shows when a request fails. Pure,
 * so tests check it without a browser or a server.
 */

/**
 * Shown instead of the field when the application cannot be read for a
 * reason other than "no application", so the page does not offer a first
 * move as if the offer had none.
 * ASSUMPTION(oferty-pracy-lq3.1/ASM-1)
 */
export const stageReadFailureText = 'Nie udało się wczytać etapu aplikacji.'

/**
 * What a failed read of the application means for the field: only a 404
 * answer is an offer without an application, shown as "Bez aplikacji";
 * any other failure (a server error, 403, a lost connection) is a read that
 * failed, shown as the read failure text instead of the field.
 * ASSUMPTION(oferty-pracy-lq3.1/ASM-1)
 */
export function readFailureOutcome(
  error: unknown,
): 'no_application' | 'read_failed' {
  return isNotFound(error) ? 'no_application' : 'read_failed'
}

/**
 * Shown next to the field when a move fails without a refusal code, such
 * as a lost connection; the stage stays and the owner may retry (A-R13).
 * ASSUMPTION(oferty-pracy-lq3.1/ASM-1)
 */
export const stageMoveFailureText =
  'Nie udało się zmienić etapu. Spróbuj ponownie.'

/**
 * The text for a failed move: the refusal's text for its code, the code
 * itself for a code without a text (D13), or the failure text when the
 * answer carries no code (ASSUMPTION(oferty-pracy-lq3.1/ASM-1)).
 */
export function moveFailureText(error: unknown): string {
  const code = refusalCodeOf(error)
  return code ? refusalText(code) : stageMoveFailureText
}
