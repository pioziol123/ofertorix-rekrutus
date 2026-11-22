import type { AiExecution, ExecutionCause } from '../../ai/index.ts'
import type { ResearchViewState } from './research-view.ts'

/**
 * What the owner sees of a research, chosen from the public state and
 * cause of its AI work alone (A14-AC12), never from how the work got there.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-2): the messages below. For research
 * with an assignment, which has no state or cause of its own, only the
 * messages of a rejected report and of a failed assignment apply.
 */

/** Why Companies did not accept a report. */
export type ResearchRejection = 'no_sourced_findings' | 'invalid_report'

const previousKept = 'Poprzedni raport pozostaje dostępny.'

/** The message of a report Companies did not accept. */
export function rejectionMessage(reason: ResearchRejection): string {
  return reason === 'no_sourced_findings'
    ? `Raport nie zawiera żadnych ustaleń popartych źródłami. Nie uznano go za gotowy research. ${previousKept} Ponowienie wymaga nowego żądania i kosztu.`
    : `Nie udało się uzyskać kompletnego raportu z dowodami (validation). ${previousKept}`
}

/** The message of research whose AI work ended without a report. */
export function endMessage(end: {
  state: 'failed' | 'uncertain'
  cause: ExecutionCause
}): string {
  if (end.state === 'failed' && end.cause === 'no_content')
    return 'Wyszukiwanie nie dostarczyło materiałów z poprawnymi cytowaniami. Nie przygotowano raportu ani nie uruchomiono syntezy. Ponowienie wymaga nowego żądania i kosztu.'
  if (end.cause === 'http')
    return 'Usługa researchu zwróciła błąd HTTP. Koszt pozostaje zarezerwowany.'
  return `Nie udało się uzyskać kompletnego raportu z dowodami. ${previousKept}`
}

/**
 * The message of research whose assignment failed (T9-R02): the receiver
 * gets no cause, so the message names none; the details of the failure are
 * in the AI assignments panel.
 * ASSUMPTION(oferty-pracy-sq2.10/ASM-3): today's message of research that
 * ended without a report for any other cause, with the pointer to the
 * panel the Profile's message of a failed assignment has.
 */
export const failedAssignmentMessage = `Nie udało się uzyskać kompletnego raportu z dowodami. ${previousKept} Szczegóły są w panelu zleceń AI.`

/**
 * The message of research whose AI work was retried: only research that
 * was in progress at the migration to AI, ended as interrupted with its
 * reservation released.
 */
export const interruptedMessage =
  'Research przerwano przy zmianie wersji aplikacji, a rezerwację zwolniono. Ponowienie wymaga nowego żądania.'

/**
 * The state of research of the old way from its AI work: waiting for budget, queued, in
 * progress (running or delivering), completed, failed (failed, rejected or
 * retried) or unknown (uncertain, its cost stays reserved).
 */
export function researchViewState(
  execution: Pick<AiExecution, 'state'>,
): ResearchViewState {
  switch (execution.state) {
    case 'waiting_budget':
    case 'queued':
    case 'running':
    case 'completed':
      return execution.state
    case 'delivering':
      return 'running'
    case 'uncertain':
      return 'unknown'
    case 'failed':
    case 'rejected':
    case 'retried':
      return 'failed'
  }
}

/**
 * The state of the cost of research of the old way: reserved while the work is in progress (none
 * while it waits for budget), then settled, or unknown while its
 * reservation stays.
 */
export function researchCostState(
  execution: Pick<AiExecution, 'state' | 'cost' | 'finishedAt'>,
): 'reserved' | 'settled' | 'unknown' | null {
  if (execution.state === 'waiting_budget') return null
  if (!execution.finishedAt) return 'reserved'
  return execution.cost.actual === null ? 'unknown' : 'settled'
}
