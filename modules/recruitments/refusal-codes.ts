/**
 * The stable codes a refusal of the Recruitments module reaches a page with
 * (D13), and the texts the pages show for them (A-R07, A-R10). The codes are
 * separate strings from the domain's reasons; the HTTP handler maps every
 * reason to one of them. Browser-safe: pages read it through `view.ts`.
 */
export type RefusalCode =
  | 'application_stage_changed'
  | 'application_not_found'
  | 'transition_not_allowed'
  | 'note_too_long'
  | 'invalid_input'

/** The message of A-R07. */
export const stageChangedMessage =
  'Etap tej aplikacji się zmienił — odśwież stronę'

/** The message of A-R10. */
export const noteTooLongMessage = 'Notatka może mieć najwyżej 10 000 znaków'

const texts: Partial<Record<string, string>> = {
  application_stage_changed: stageChangedMessage,
  note_too_long: noteTooLongMessage,
}

/**
 * The text a page shows for a refusal's code. The pages never send a
 * request that ends in a code without a text; if one arrives, the page
 * shows the code itself (D13).
 */
export function refusalText(code: string): string {
  return texts[code] ?? code
}
