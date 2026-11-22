/**
 * What the company view shows of a research's state. Browser-safe: views
 * read it through `view.ts`.
 */

/** The states of research the owner sees (T9-R03). */
export type ResearchViewState = 'running' | 'completed' | 'failed'

/** The text of each state in the company view. */
export const researchStateLabels: Record<ResearchViewState, string> = {
  running: 'Trwa zbieranie źródeł i przygotowywanie raportu',
  completed: 'Gotowy',
  failed: 'Nie udało się przygotować raportu',
}

/** The states in which research is still in progress for the owner. */
export const researchActiveStates: readonly ResearchViewState[] = ['running']

/**
 * The state of research from Companies' own data alone (T9-R03): in
 * progress until its receiver saved an outcome, then completed with a
 * published report, or failed with a saved message (a failed assignment,
 * or a report that did not pass Companies' own check). An assignment
 * needing attention is still in progress for the owner.
 */
export function researchState(saved: {
  report: boolean
  message: boolean
}): ResearchViewState {
  if (saved.report) return 'completed'
  if (saved.message) return 'failed'
  return 'running'
}

/**
 * Whether the company's research history shows a research (T10-R08):
 * every research with an assignment; research made before the deployment
 * of assignments only with a saved report, or when the deployment ended it
 * as failed (T10-R02), which saved the message of a failed assignment,
 * `failedMessage`. Earlier research that ended without a report is not
 * shown.
 * ASSUMPTION(oferty-pracy-sq2.11/ASM-1): the message of a failed
 * assignment tells research the deployment ended from research that ended
 * before it, which the old way's receiver never gave that message.
 */
export function shownResearch(
  research: { assignment: boolean; report: boolean; message: string | null },
  failedMessage: string,
): boolean {
  return (
    research.assignment || research.report || research.message === failedMessage
  )
}
