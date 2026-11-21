import type {
  AiExecution,
  ExecutionCause,
  ExecutionState,
} from '../../ai/index.ts'

/**
 * What the owner sees when proposal preparation ends without a proposal.
 * The message follows from the public state and cause alone, so the same
 * state and cause give the same message whichever provider ran the work.
 */
export const uncertainMessage =
  'Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem.'

const unavailable =
  'Nie udało się połączyć z AI lub odczytać odpowiedzi. Profil pozostaje bez zmian.'

const failureMessages: Record<ExecutionCause, string> = {
  refused:
    'AI odmówiło przygotowania propozycji. Sprawdź tekst zawodowy. Profil pozostaje bez zmian.',
  incomplete:
    'AI nie ukończyło odpowiedzi. Spróbuj przygotować propozycję z krótszego tekstu. Profil pozostaje bez zmian.',
  no_content:
    'AI nie zwróciło jednej kompletnej propozycji. Profil pozostaje bez zmian.',
  format:
    'Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian.',
  // The existing message of a run that ended after it lost its lease.
  interrupted:
    'Worker utracił prawo do publikacji. Odpowiedź pozostała w historii.',
  configuration: unavailable,
  network: unavailable,
  http: unavailable,
  aborted: unavailable,
  model_unavailable: unavailable,
  context_overflow: unavailable,
  adapter_unavailable: unavailable,
  unknown: unavailable,
}

/** The owner's message for an end without a result. */
export function preparationMessage(end: {
  state: 'failed' | 'uncertain'
  cause: ExecutionCause
}): string {
  return end.state === 'uncertain'
    ? uncertainMessage
    : failureMessages[end.cause]
}

/**
 * The import status of a preparation whose assignment is in progress or
 * needs attention, labelled "Przygotowywanie propozycji" (T7-R04). It ends
 * only through the Profile's receiver.
 */
export const assignmentInProgress = 'ai_running'

/**
 * The owner's message after the assignment of a preparation failed
 * (T7-R04), whatever made it fail; the details are in the AI assignments
 * panel. A proposal the Profile's own check refuses keeps its message of
 * the check.
 */
export const failedAssignmentMessage =
  'Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI.'

/** The import status of proposal preparation of the old way in progress. */
const progressStatus: Partial<Record<ExecutionState, string>> = {
  waiting_budget: 'waiting_budget',
  queued: 'ai_queued',
  running: 'ai_running',
  delivering: 'ai_running',
}

/** The import statuses that mean proposal preparation is in progress. */
export const preparationInProgress: readonly string[] = [
  'ai_queued',
  'ai_running',
  'waiting_budget',
]

/**
 * Whether the view of an import needs the latest execution of the old way:
 * only a preparation of the old way the import last recorded as in
 * progress. A preparation with an assignment is shown from the import's
 * own data alone, which the Profile's receiver updates at its end.
 */
export function needsOldExecution(stored: {
  status: string
  assignmentId: string | null
}): boolean {
  return (
    stored.assignmentId === null &&
    preparationInProgress.includes(stored.status)
  )
}

/**
 * The status and message of an import. A preparation of the old way the
 * import last recorded as in progress shows the latest execution of the
 * import: an end without a result shows its message; an end with the
 * Profile's decision is recorded with the import itself. Everything else,
 * a preparation with an assignment included, shows what the import stores.
 */
export function preparationView(
  stored: { status: string; error: string | null; assignmentId: string | null },
  execution: AiExecution | null,
): { status: string; error: string | null } {
  const own = { status: stored.status, error: stored.error }
  if (!execution || !needsOldExecution(stored)) return own
  const status = progressStatus[execution.state]
  if (status) return { status, error: null }
  if (
    (execution.state === 'failed' || execution.state === 'uncertain') &&
    execution.cause
  )
    return {
      status: 'needs_attention',
      error: preparationMessage({
        state: execution.state,
        cause: execution.cause,
      }),
    }
  return own
}
