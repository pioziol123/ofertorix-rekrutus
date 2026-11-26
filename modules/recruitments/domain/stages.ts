/**
 * The stages of an application and the transitions the owner may make
 * between them (A-R02, A-R03). Plain rules on passed values: no database,
 * HTTP or other module (D12). The browser reads them through `view.ts`.
 */

/** The stored stage values (A-R02), in the order the pages list them. */
export const stages = ['to_consider', 'cv_sent', 'rejected', 'removed'] as const
export type Stage = (typeof stages)[number]

/** The labels of the stages, as every page shows them (A-R02, A-R14). */
export const stageLabels: Record<Stage, string> = {
  to_consider: 'Do rozważenia',
  cv_sent: 'CV wysłane',
  rejected: 'Odrzucone',
  removed: 'Zdjęta z listy',
}

/** The label of an offer without an application (A-R14). */
export const noApplicationLabel = 'Bez aplikacji'

/**
 * The transition table of A-R03: the stages the owner may move an
 * application to from each state, `null` standing for an offer without an
 * application, where the move creates it.
 */
const transitions: Record<Stage | 'none', readonly Stage[]> = {
  none: ['to_consider', 'cv_sent', 'rejected'],
  to_consider: ['cv_sent', 'rejected', 'removed'],
  cv_sent: ['to_consider', 'rejected'],
  rejected: ['to_consider', 'cv_sent', 'removed'],
  removed: ['to_consider', 'cv_sent', 'rejected'],
}

/**
 * The stages A-R03 allows from a state, `null` for no application, in the
 * order of `stages` (A-R04). The stage field lists exactly these.
 */
export function allowedStages(from: Stage | null): readonly Stage[] {
  return transitions[from ?? 'none']
}

/** Whether A-R03 allows the move from a state, `null` for no application. */
export function isAllowed(from: Stage | null, to: Stage): boolean {
  return allowedStages(from).includes(to)
}

export function isStage(value: unknown): value is Stage {
  return (stages as readonly unknown[]).includes(value)
}
