import { z, ZodError } from 'zod'
import {
  ApplicationMissing,
  RecruitmentRefusal,
  type RefusalReason,
} from '../../domain/moves.ts'
import { stages } from '../../domain/stages.ts'
import { moveApplication } from '../../move-application.ts'
import { readApplication } from '../../read-applications.ts'
import { readApplicationsPage } from '../../read-applications-page.ts'
import { saveNote } from '../../save-note.ts'
import type { RefusalCode } from '../../refusal-codes.ts'

/**
 * The HTTP handler of the Recruitments module. It validates the request,
 * calls the module's operations and alone maps their refusals to a status
 * and a stable code in the response body (D13). The routes pass it the
 * route parameter and the parsed body.
 */

/**
 * Every refusal reason with its response. A mapped type with no default:
 * a new reason fails the type check until it has a code (D13).
 */
const responses: {
  [R in RefusalReason]: { status: number; code: RefusalCode }
} = {
  stage_changed: { status: 409, code: 'application_stage_changed' },
  transition_not_allowed: { status: 422, code: 'transition_not_allowed' },
  application_missing: { status: 404, code: 'application_not_found' },
  note_too_long: { status: 422, code: 'note_too_long' },
}

/**
 * A refusal answered over HTTP: its status and the code for the response
 * body. The routes' utility turns it into the framework's error.
 */
export class RefusalResponse extends Error {
  readonly statusCode: number
  readonly statusMessage: string
  readonly data: { code: string }
  constructor(status: number, code: string) {
    super(code)
    this.statusCode = status
    this.statusMessage = code
    this.data = { code }
  }
}

const refused = (status: number, code: string) =>
  new RefusalResponse(status, code)

/**
 * Runs a request and answers a refusal of the module, or input that fails
 * validation, with its status and code. Other errors pass through. The
 * Offers route of start application uses it too, so the Recruitments
 * refusals pass through unchanged.
 */
export async function answerRecruitmentRefusals<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof RecruitmentRefusal) {
      const { status, code } = responses[error.reason]
      throw refused(status, code)
    }
    if (error instanceof ZodError) throw refused(422, 'invalid_input')
    throw error
  }
}

/** An offer ID in a route parameter. */
export const offerIdInput = z.uuid()
const uuid = offerIdInput

/** The stage the body names, one of the four stored values. */
export const stageInput = z.enum(stages)

const moveBody = z.object({ expected: stageInput, target: stageInput })

/** Reads an offer's application; none, or a malformed ID, gives 404. */
export function readApplicationOverHttp(offerId: string | undefined) {
  return answerRecruitmentRefusals(async () => {
    const application = await readApplication(offerId ?? '')
    if (!application) throw new ApplicationMissing()
    return application
  })
}

/** The offer ID of a command; one that is not a UUID is malformed input. */
function commandOfferId(offerId: string | undefined): string {
  const id = uuid.safeParse(offerId)
  // A malformed offer ID is malformed input (refusal table of D13).
  if (!id.success) throw refused(422, 'invalid_input')
  return id.data.toLowerCase()
}

/**
 * Moves an offer's application from the shown stage to the chosen one. An
 * offer ID that is not a UUID is malformed input.
 */
export function moveApplicationOverHttp(
  offerId: string | undefined,
  body: unknown,
) {
  return answerRecruitmentRefusals(async () => {
    const id = commandOfferId(offerId)
    const input = moveBody.parse(body)
    return moveApplication({
      offerId: id,
      expected: input.expected,
      target: input.target,
      now: new Date(),
    })
  })
}

const noteBody = z.object({ note: z.string() })

/**
 * Saves the note of an offer's application. A note over the limit is
 * `note_too_long`, an offer without an application `application_not_found`
 * and an offer ID that is not a UUID `invalid_input`.
 */
export function saveNoteOverHttp(offerId: string | undefined, body: unknown) {
  return answerRecruitmentRefusals(async () => {
    const id = commandOfferId(offerId)
    const { note } = noteBody.parse(body)
    return saveNote({ offerId: id, text: note })
  })
}

/**
 * One page of Moja lista for the page's address; values the read cannot
 * use give their defaults, so it refuses nothing.
 */
export function readApplicationsPageOverHttp(query: Record<string, unknown>) {
  return readApplicationsPage(query)
}
