/**
 * The messages the owner sees of research that ended without a published
 * report. Research has no state or cause of its AI work of its own: only
 * the messages of a rejected report and of a failed assignment apply.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-2): the messages below.
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

/**
 * The message of research whose assignment failed (T9-R02): the receiver
 * gets no cause, so the message names none; the details of the failure are
 * in the AI assignments panel. Research of the old way unfinished at the
 * deployment of assignments ends with it too (T10-R02).
 * ASSUMPTION(oferty-pracy-sq2.10/ASM-3): today's message of research that
 * ended without a report for any other cause, with the pointer to the
 * panel the Profile's message of a failed assignment has.
 */
export const failedAssignmentMessage = `Nie udało się uzyskać kompletnego raportu z dowodami. ${previousKept} Szczegóły są w panelu zleceń AI.`
