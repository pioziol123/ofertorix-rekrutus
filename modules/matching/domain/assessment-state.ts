import type {
  AiRequestErrorCode,
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

/**
 * The configuration message of a group command, as before: a group runs at
 * the batch price, so it still names the Batch price list.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-3)
 */
export const groupNotConfiguredMessage =
  'Skonfiguruj model i cennik Batch przed oceną ofert.'

/**
 * What a request AI refused means to the owner, for a single assessment or
 * a group. The limits keep the messages they had on the former batch path.
 */
export function refusalMessage(
  code: AiRequestErrorCode,
  kind: 'single' | 'group',
): string {
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-3): a message for a provider that
  // cannot take the work now, which the former batch path never met.
  if (code === 'provider_unavailable')
    return 'Model jest teraz niedostępny. Spróbuj ponownie później.'
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the refusal causes of the batch
  // limits; ASSUMPTION(oferty-pracy-0mq.21/ASM-5): the input cap.
  if (code === 'input_too_large') return inputLimitMessage(kind)
  if (code === 'batch_too_large')
    return 'Zaznacz mniej ofert: plik tej partii przekracza 2 MiB.'
  return kind === 'group' ? groupNotConfiguredMessage : notConfiguredMessage
}

/** The message of an input above the limit, as the former paths had it. */
export function inputLimitMessage(kind: 'single' | 'group'): string {
  return kind === 'single'
    ? 'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.'
    : 'Jedna z ofert przekracza limit danych oceny. Zmień zaznaczenie lub limit wejścia.'
}
