import { refusalText } from '../../modules/recruitments/view'

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
  const code = (error as { data?: { data?: { code?: unknown } } } | null)?.data
    ?.data?.code
  return typeof code === 'string' && code
    ? refusalText(code)
    : stageMoveFailureText
}
