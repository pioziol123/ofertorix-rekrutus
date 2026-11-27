import { RecruitmentRefusal } from './moves.ts'

/**
 * The note of an application (A-R09, A-R10). Plain rules on passed values
 * (D12); the browser reads them through `view.ts`, so the counter under the
 * note and the server count the same way.
 */

/** The most characters a note may have (A-R09). */
export const noteLimit = 10_000

/** The length of a note in characters, counted as Unicode code points. */
export const noteLength = (text: string): number => [...text].length

/** Whether a note fits the limit of A-R09. */
export const noteFits = (text: string): boolean => noteLength(text) <= noteLimit

/** A number with its thousands separated by a space, as "10 000". */
const grouped = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** The counter under the note: characters typed and the limit (T2-R13). */
export const noteCounterText = (text: string): string =>
  `${grouped(noteLength(text))} / ${grouped(noteLimit)}`

/** The note is over the limit of A-R09 (A-R10). */
export class NoteTooLong extends RecruitmentRefusal {
  readonly reason = 'note_too_long'
  constructor() {
    super('The note is over the limit of characters (A-R10)')
  }
}

/** Refuses a note over the limit (A-R10). */
export function checkNote(text: string): void {
  if (!noteFits(text)) throw new NoteTooLong()
}
