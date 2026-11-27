import { ApplicationMissing } from './domain/moves.ts'
import { checkNote } from './domain/note.ts'
import { updateNote } from './infrastructure/persistence/applications.ts'

/**
 * Saves the note of an offer's application (A-R09): the text replaces the
 * previous one, which is not kept, and the stage and its moment stay. A
 * note over the limit is refused (A-R10); an offer without an application
 * is refused and gets none (A-R12). Of two saves the later one wins
 * (A-R11); a parallel move changes other columns and both take effect.
 */
export async function saveNote(command: {
  offerId: string
  text: string
}): Promise<{ note: string }> {
  checkNote(command.text)
  if (!(await updateNote(command))) throw new ApplicationMissing()
  return { note: command.text }
}
