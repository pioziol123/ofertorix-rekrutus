import {
  ownerActions,
  type AssignmentFailureReason,
  type AssignmentStatus,
  type AssignmentType,
} from './assignment.ts'
import type {
  OperationCause,
  OperationState,
  OperationWait,
} from './operation.ts'

/**
 * What the AI assignments panel reads and shows (task oferty-pracy-sq2.12,
 * T11 of epic sq2). Browser-safe: views read it through `view.ts`, the
 * server reads in `assignments/read-assignment-list.ts` and
 * `assignments/read-assignment-details.ts` return these shapes.
 */

/** One row of the panel's list (T11-R02); amounts in złoty. */
export type AssignmentRow = {
  assignmentId: string
  label: string
  type: AssignmentType
  /** The requesting module's display name from its settings. */
  requestingModule: string
  executor: string
  status: AssignmentStatus
  /** The reason of a failed assignment; null otherwise. */
  failureReason: AssignmentFailureReason | null
  placedAt: string
  deadline: string
  finishedAt: string | null
  /**
   * Seconds left to the time limit for an assignment not yet final, zero
   * once the deadline has passed; null for a final one.
   */
  timeLeftSeconds: number | null
  /** The assignment's budget charge (ZA-R04). */
  charge: string
}

/** One page of the list: at most 50 rows, and the cursor of the next. */
export type AssignmentListPage = {
  items: AssignmentRow[]
  /** Null when no row follows the page. */
  nextCursor: string | null
}

/** The panel's list shows this many assignments at a time (T11-R02, O-10). */
export const assignmentPageSize = 50

/** One operation of an assignment in its details (T11-R03). */
export type OperationDetails = {
  ordinal: number
  /** `manual` for an operation the owner added with Retry. */
  origin: 'automatic' | 'manual'
  state: OperationState
  /** What a pending operation waits for; null unless pending. */
  waitsFor: OperationWait | null
  /** The executor's parameters the operation is carried out with. */
  executorParameters: Record<string, string | null>
  pendingSince: string
  startedAt: string | null
  finishedAt: string | null
  /** Null until the operation started. */
  potentialCost: string | null
  /** Null while not started, running, or unknown. */
  actualCost: string | null
  /** True for an operation that ended without an established cost. */
  actualCostUnknown: boolean
  /** The cause of a failed or uncertain end; null otherwise. */
  cause: OperationCause | null
  /** Whether a failed operation may be retried; null unless failed. */
  retryable: boolean | null
}

/**
 * An assignment's details (T11-R03): its row data, the cost figures of
 * T3-R08 and its operations from the first. No raw response, request or
 * result.
 */
export type AssignmentDetails = AssignmentRow & {
  cost: {
    potential: string
    actual: string
    charge: string
    unknownCosts: number
  }
  operations: OperationDetails[]
}

/** The text of each assignment status (T11-R06). */
export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  in_progress: 'W toku',
  needs_attention: 'Wymaga uwagi',
  succeeded: 'Udane',
  failed: 'Nieudane',
}

/** The text of each reason of a failed assignment (T11-R06). */
export const failureReasonLabels: Record<AssignmentFailureReason, string> = {
  rejected: 'Odrzucone przez właściciela',
  time_limit: 'Przekroczony limit czasu',
  delivery_failed: 'Wynik nie odebrany',
}

/** The text of each assignment type (T11-R06). */
export const assignmentTypeLabels: Record<AssignmentType, string> = {
  single: 'Pojedyncza odpowiedź',
  agent: 'Sesja agenta',
}

/** The texts of operation states (T11-R06); a pending one by its wait. */
export const operationStateLabels = {
  pending: { budget: 'Oczekuje na budżet', executor: 'Oczekuje na wykonawcę' },
  running: 'W toku',
  succeeded: 'Udana',
  failed: 'Nieudana',
  uncertain: 'Niepewna',
} as const satisfies Record<Exclude<OperationState, 'pending'>, string> & {
  pending: Record<OperationWait, string>
}

/** The text of an operation's state; a pending one says what it waits for. */
export function operationStateText(operation: {
  state: OperationState
  waitsFor: OperationWait | null
}): string {
  if (operation.state === 'pending')
    return operationStateLabels.pending[operation.waitsFor ?? 'executor']
  return operationStateLabels[operation.state]
}

/** The wording of each cause of an operation's end, for the owner. */
export const operationCauseLabels: Record<OperationCause, string> = {
  refused: 'Model odmówił wykonania pracy',
  incomplete: 'Odpowiedź urwała się przed końcem',
  no_content: 'Odpowiedź bez użytecznej treści',
  format: 'Nie udało się odczytać odpowiedzi',
  configuration:
    'Brak klucza lub adresu wykonawcy albo dostawca nie przyjmuje takiego żądania',
  network: 'Brak połączenia z dostawcą lub zerwane połączenie',
  http: 'Limit zapytań lub błąd serwera dostawcy',
  aborted: 'Praca została przerwana',
  model_unavailable: 'Model niedostępny u dostawcy',
  context_overflow: 'Dane wejściowe nie mieszczą się w kontekście modelu',
  unknown: 'Nieznana przyczyna',
  not_started: 'Nie rozpoczęta: zlecenie zakończyło się wcześniej',
  time_limit_run: 'Przekroczony maksymalny czas działania',
}

/** The text of a failed operation's cause with whether it may be retried. */
export function operationCauseText(operation: {
  cause: OperationCause | null
  retryable: boolean | null
}): string | null {
  if (operation.cause === null) return null
  const cause = operationCauseLabels[operation.cause]
  if (operation.retryable === false) return `${cause} (błąd bez ponawiania)`
  return cause
}

/** The time left to the time limit, for the owner; null for a final one. */
export function timeLeftText(seconds: number | null): string | null {
  if (seconds === null) return null
  if (seconds <= 0) return 'Limit czasu minął'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${Math.max(minutes, 1)} min`
}

/** An amount in złoty with two decimal places at least, as the owner reads it. */
export function amountText(amount: string): string {
  const [whole = '0', fraction = ''] = amount.split('.')
  const kept = fraction.replace(/0+$/, '').padEnd(2, '0')
  return `${whole},${kept} zł`
}

/** The actual cost of an operation: an unknown one is shown as unknown. */
export function actualCostText(operation: {
  actualCost: string | null
  actualCostUnknown: boolean
}): string {
  if (operation.actualCostUnknown) return 'nieznany'
  return operation.actualCost === null ? '—' : amountText(operation.actualCost)
}

/** The executor's parameters as one line, e.g. `model: gpt, effort: low`. */
export function parametersText(
  parameters: Record<string, string | null>,
): string {
  const entries = Object.entries(parameters)
  if (!entries.length) return '—'
  return entries.map(([name, value]) => `${name}: ${value ?? '—'}`).join(', ')
}

/**
 * What an owner's action on an assignment (T12) returns: whether it took
 * effect and the assignment's status after it. An action the status no
 * longer allows changes nothing and returns the current status (T12-R04).
 */
export type AssignmentActionOutcome = {
  changed: boolean
  status: AssignmentStatus
}

/**
 * The owner's actions the details page offers for an assignment (T12-R01,
 * T12-R03, T12-R05), by the rule of `ownerActions`: the page knows the
 * time left to the time limit, as the read gave it.
 */
export function assignmentActions(assignment: {
  status: AssignmentStatus
  timeLeftSeconds: number | null
}): { retry: boolean; reject: boolean } {
  return ownerActions({
    status: assignment.status,
    withinTimeLimit: (assignment.timeLeftSeconds ?? 0) > 0,
  })
}

/**
 * The message after an owner's action: "Zlecenie zmieniło stan" with the
 * current status when it changed nothing (T12-R04); null when it took
 * effect.
 */
export function actionOutcomeText(
  outcome: AssignmentActionOutcome,
): string | null {
  if (outcome.changed) return null
  return `Zlecenie zmieniło stan. Obecny status: ${assignmentStatusLabels[outcome.status]}.`
}

/** The message when an action could not be saved (T12-R06). */
export const actionFailedText = {
  retry: 'Nie udało się ponowić zlecenia. Zlecenie pozostaje bez zmian.',
  reject:
    'Nie udało się odrzucić zlecenia: moduł zlecający nie przyjął informacji o niepowodzeniu albo zapis się nie powiódł. Zlecenie pozostaje bez zmian; możesz odrzucić je ponownie.',
} as const
