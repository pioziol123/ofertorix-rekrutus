import type { AssignmentErrorCode } from '../../ai/index.ts'
import type { MatchingState } from './assessment-view.ts'

/**
 * The state of an assessment request the owner sees, from Matching's own
 * data alone (T8-R04): an excluded request never reached AI; any other is
 * in progress until its receiver saved an outcome, then completed with a
 * saved assessment, or failed with a saved message (a failed assignment,
 * or a result that did not pass Matching's own check). An assignment
 * needing attention is still in progress for the owner.
 */
export function assessmentState(saved: {
  excluded: boolean
  assessment: boolean
  message: boolean
}): MatchingState {
  if (saved.excluded) return 'excluded'
  if (saved.assessment) return 'completed'
  if (saved.message) return 'failed'
  return 'running'
}

const notConfirmed =
  'Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian.'

/** The message of a result Matching rejected, with its safe diagnostic. */
export function rejectionMessage(code: string): string {
  return `${notConfirmed} [Ocena: ${code}]`
}

/**
 * The message of an assessment whose assignment failed (T8-R03): the
 * receiver gets no cause, so the message names none; the details of the
 * failure are in the AI assignments panel. An assessment of the old way
 * unfinished at the deployment of assignments ends with it too (T10-R02).
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-2): today's message of an assessment
 * that was not carried out, without the cause it can no longer name.
 */
export const failedAssignmentMessage =
  'Ocena nie została wykonana. Poprzednie wyniki pozostały bez zmian. Szczegóły są w panelu zleceń AI.'

/**
 * What a refused assignment means to the owner, for a single assessment or
 * a group (T8-R05): an oversized request keeps the message of the input
 * limit it had; any other refusal is a gap in the AI configuration.
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-2): a group, which no longer runs at
 * the Batch price, gets the configuration message of a single assessment.
 */
export function assignmentRefusalMessage(
  code: AssignmentErrorCode,
  kind: 'single' | 'group',
): string {
  if (code === 'request_too_large') return inputLimitMessage(kind)
  return notConfiguredMessage
}

/** The configuration message the owner sees. */
export const notConfiguredMessage =
  'Skonfiguruj model i cennik przed oceną ofert.'

/** The message of an input above the limit. */
export function inputLimitMessage(kind: 'single' | 'group'): string {
  return kind === 'single'
    ? 'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.'
    : 'Jedna z ofert przekracza limit danych oceny. Zmień zaznaczenie lub limit wejścia.'
}
