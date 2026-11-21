import type {
  AssignmentErrorCode,
  ExecutionCause,
  ExecutionState,
} from '../../ai/index.ts'
import type { MatchingState } from './assessment-view.ts'

/**
 * The state of an assessment request the owner sees. A request Matching
 * excluded never reached AI; for any other one the stage of the AI work
 * comes from its latest execution, read by its public state alone.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-3): the states the owner sees.
 */
export function assessmentState(
  requestState: string,
  execution: { state: ExecutionState } | null,
): MatchingState {
  if (requestState === 'excluded') return 'excluded'
  if (!execution) return 'failed'
  return executionStateOf[execution.state]
}

/**
 * The state of an assessment request whose AI work is an assignment, from
 * Matching's own data alone (T8-R04): in progress until its receiver saved
 * an outcome, then completed with a saved assessment, or failed with a
 * saved message (a failed assignment, or a result that did not pass
 * Matching's own check). An assignment needing attention is still in
 * progress for the owner. The texts of waiting for the budget, of the
 * queue and of an uncertain end are never reached for it.
 */
export function assignedAssessmentState(saved: {
  assessment: boolean
  message: boolean
}): MatchingState {
  if (saved.assessment) return 'completed'
  if (saved.message) return 'failed'
  return 'running'
}

const executionStateOf: Record<ExecutionState, MatchingState> = {
  waiting_budget: 'waiting_budget',
  queued: 'queued',
  running: 'running',
  delivering: 'running',
  completed: 'completed',
  rejected: 'failed',
  failed: 'failed',
  // A retried execution is followed by the next one of the same request;
  // seen on its own it is an end without an assessment.
  retried: 'failed',
  uncertain: 'unknown',
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
 * failure are in the AI assignments panel.
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

/**
 * The diagnostics of responses the model refused, did not complete or
 * left without one usable content, as Matching has always named them.
 */
const responseDiagnostic: Partial<Record<ExecutionCause, string>> = {
  refused: 'response_refusal',
  incomplete: 'response_incomplete',
  no_content: 'response_text_count',
  format: 'response_json',
}

/**
 * The message of an assessment that ended without a result, chosen from
 * the public state and cause alone.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-3): the messages of causes the old
 * paths had no message for.
 */
export function endMessage(end: {
  state: 'failed' | 'uncertain'
  cause: ExecutionCause
}): string {
  if (end.state === 'uncertain')
    return `Nie wiadomo, jak zakończyła się ocena. Koszt pozostaje zarezerwowany; sprawdź stan wykonania przed ponowieniem. [AI: ${end.cause}]`
  const diagnostic = responseDiagnostic[end.cause]
  if (diagnostic) return rejectionMessage(diagnostic)
  return `Ocena nie została wykonana. Poprzednie wyniki pozostały bez zmian. [AI: ${end.cause}]`
}

/**
 * The configuration message the owner sees.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-3): it no longer names the Batch price
 * list, since a single assessment uses the standard one.
 */
export const notConfiguredMessage =
  'Skonfiguruj model i cennik przed oceną ofert.'

/** The message of an input above the limit, as the former paths had it. */
export function inputLimitMessage(kind: 'single' | 'group'): string {
  return kind === 'single'
    ? 'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.'
    : 'Jedna z ofert przekracza limit danych oceny. Zmień zaznaczenie lub limit wejścia.'
}
