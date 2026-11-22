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
 * the check. A preparation of the old way unfinished at the deployment of
 * assignments ends with it too (T10-R02).
 */
export const failedAssignmentMessage =
  'Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI.'

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
