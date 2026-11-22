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
 * in the AI assignments panel.
 * ASSUMPTION(oferty-pracy-sq2.10/ASM-3): today's message of research that
 * ended without a report for any other cause, with the pointer to the
 * panel the Profile's message of a failed assignment has.
 */
export const failedAssignmentMessage = `Nie udało się uzyskać kompletnego raportu z dowodami. ${previousKept} Szczegóły są w panelu zleceń AI.`

/**
 * The message of research of the old way that was unfinished at the
 * deployment of assignments, which the migration step ends as failed
 * (T10-R02). It has no assignment, so it does not point to the AI
 * assignments panel, whose history starts empty (T10-R03). Only such
 * research has it, so it also tells the view that the deployment ended it
 * (ASSUMPTION(oferty-pracy-sq2.11/ASM-1)).
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-3): the wording, after the message
 * research had for work interrupted by an earlier change of the
 * application.
 */
export const endedAtDeploymentMessage = `Research przerwano przy zmianie wersji aplikacji. ${previousKept} Ponowienie wymaga nowego żądania.`
