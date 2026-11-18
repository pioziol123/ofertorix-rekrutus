import type { ExecutionCause, ExecutionState } from '../../ai/index.ts'
import type { MatchingState } from '../../../lib/matching/view.ts'

/**
 * The state of an assessment request the owner sees. A request Matching
 * excluded never reached AI; for any other one the stage of the AI work
 * comes from its latest execution, read by its public state alone.
 */
export function assessmentState(
  requestState: string,
  execution: { state: ExecutionState } | null,
): MatchingState {
  if (requestState === 'excluded') return 'excluded'
  if (!execution) return 'failed'
  return executionStateOf[execution.state]
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
