/**
 * What the company view shows of a research's state. Browser-safe: views
 * read it through `view.ts`.
 */

/**
 * The states of research the owner sees. Research with an assignment is
 * only ever running, completed or failed (T9-R03); waiting for the budget,
 * queued and unknown remain for research of the old way until task
 * oferty-pracy-sq2.11.
 */
export type ResearchViewState =
  'waiting_budget' | 'queued' | 'running' | 'completed' | 'failed' | 'unknown'

/** The text of each state in the company view. */
export const researchStateLabels: Record<ResearchViewState, string> = {
  // Research of the old way only.
  waiting_budget: 'Czeka na dostępny budżet',
  queued: 'Czeka na wykonanie',
  unknown: 'Przerwano — koszt wymaga sprawdzenia',
  // Research with an assignment, and of the old way.
  running: 'Trwa zbieranie źródeł i przygotowywanie raportu',
  completed: 'Gotowy',
  failed: 'Nie udało się przygotować raportu',
}

/** The states in which research is still in progress for the owner. */
export const researchActiveStates: readonly ResearchViewState[] = [
  'waiting_budget',
  'queued',
  'running',
]

/**
 * The state of research whose AI work is an assignment, from Companies'
 * own data alone (T9-R03): in progress until its receiver saved an
 * outcome, then completed with a published report, or failed with a saved
 * message (a failed assignment, or a report that did not pass Companies'
 * own check). An assignment needing attention is still in progress for the
 * owner. Waiting for the budget, the queue and an uncertain end are never
 * reached for it.
 */
export function assignedResearchState(saved: {
  report: boolean
  message: boolean
}): ResearchViewState {
  if (saved.report) return 'completed'
  if (saved.message) return 'failed'
  return 'running'
}
