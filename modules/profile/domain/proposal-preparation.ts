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

/**
 * The owner's message of a preparation of the old way that was unfinished
 * at the deployment of assignments, which the migration step ends as
 * failed (T10-R02). It has no assignment, so it does not point to the AI
 * assignments panel, whose history starts empty (T10-R03).
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-3): the wording, after the message
 * research had for work interrupted by an earlier change of the
 * application.
 */
export const endedAtDeploymentMessage =
  'Przygotowanie propozycji przerwano przy zmianie wersji aplikacji. Profil pozostaje bez zmian. Ponowienie wymaga nowego żądania.'

/**
 * The import statuses with which preparations of the old way were in
 * progress, which the deployment of assignments ends (T10-R02). Only the
 * first is still written, for a preparation with an assignment.
 */
export const oldWayInProgress: readonly string[] = [
  'ai_running',
  'ai_queued',
  'waiting_budget',
]
