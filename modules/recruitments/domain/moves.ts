import { isAllowed, type Stage } from './stages.ts'

/**
 * The decisions on a move of an application and their refusals (A-R03,
 * A-R07, A-R13). Plain rules on passed values (D12): the operations read
 * the state, ask these functions and write.
 */

/** The machine-readable reason of a refusal, one per broken rule. */
export type RefusalReason =
  | 'stage_changed'
  | 'transition_not_allowed'
  | 'application_missing'
  | 'note_too_long'

/**
 * A move the module refuses. Its message names the broken rule and never
 * repeats the refused value.
 */
export abstract class RecruitmentRefusal extends Error {
  abstract readonly reason: RefusalReason
}

/** The stage changed since the page read it (A-R07). */
export class StageChanged extends RecruitmentRefusal {
  readonly reason = 'stage_changed'
  constructor() {
    super('The application stage changed since the page read it (A-R07)')
  }
}

/** The pair of stages is not a transition of A-R03. */
export class TransitionNotAllowed extends RecruitmentRefusal {
  readonly reason = 'transition_not_allowed'
  constructor() {
    super('The transition is not allowed by the transition table (A-R03)')
  }
}

/** The offer has no application to move or to write a note for. */
export class ApplicationMissing extends RecruitmentRefusal {
  readonly reason = 'application_missing'
  constructor() {
    super('The offer has no application')
  }
}

/** Refuses a first move whose target A-R03 does not allow from none. */
export function checkFirstMove(target: Stage): void {
  if (!isAllowed(null, target)) throw new TransitionNotAllowed()
}

/** Refuses a move whose pair of stages is not a transition of A-R03. */
export function checkMove(expected: Stage, target: Stage): void {
  if (!isAllowed(expected, target)) throw new TransitionNotAllowed()
}

/**
 * Settles a move that found the application in another stage than the
 * page expected, or found none: the stage the owner chose is already the
 * current one, so the move is done without a record (A-R13); otherwise the
 * page is stale (A-R07). `null` means the offer has no application.
 */
export function settleUnappliedMove(
  current: Stage | null,
  target: Stage,
): 'done' {
  if (current === null) throw new ApplicationMissing()
  if (current !== target) throw new StageChanged()
  return 'done'
}
