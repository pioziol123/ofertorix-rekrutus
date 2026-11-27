import {
  noApplicationLabel,
  stageLabels,
  stageMarks,
  stages,
  type Stage,
} from '../../recruitments/view.ts'

/**
 * The stage of applications on the offer list (lq3 T3): the filter "Etap
 * aplikacji" and the stage icon of each offer. Plain rules on passed values;
 * the stages, their labels and icons are read from the Recruitments view
 * entry, their one owner (lq3 D10, A-R14).
 */

/** A value of the stage filter: a stage, or `none` for no application. */
export type StageFilterValue = 'none' | Stage

/** The values of the stage filter in the order the list shows them (T3-R03). */
export const stageFilterValues: readonly StageFilterValue[] = [
  'none',
  ...stages,
]

/** The choices of the filter "Etap aplikacji" with their labels (A-R14). */
export const stageFilterOptions: readonly {
  value: StageFilterValue
  label: string
}[] = stageFilterValues.map((value) => ({
  value,
  label: value === 'none' ? noApplicationLabel : stageLabels[value],
}))

/**
 * The stage filter of the list's address (T3-R05): the key's values
 * repeated or comma-separated, each known one once in the order of
 * `stageFilterValues`; an unknown value is left out without an error.
 */
export function readStageFilter(raw: unknown): StageFilterValue[] {
  const list = Array.isArray(raw) ? raw : [raw]
  const chosen = new Set(
    list
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim()),
  )
  return stageFilterValues.filter((value) => chosen.has(value))
}

/**
 * Whether an offer with the given stage, undefined for no application,
 * passes the chosen stages: nothing chosen passes every offer (T3-R03).
 * `none` stands for an offer that never had an application, so an offer in
 * "Zdjęta z listy" passes only `removed`.
 */
export function passesStageFilter(
  stage: Stage | undefined,
  chosen: readonly StageFilterValue[],
): boolean {
  return !chosen.length || chosen.includes(stage ?? 'none')
}

/**
 * The stage icon an offer of the list shows (T3-R01): its stage, label and
 * mark for "Do rozważenia", "CV wysłane" and "Odrzucone"; null for an offer
 * without an application and one in "Zdjęta z listy", which looks like one
 * never saved.
 */
export function listStageIcon(stage: Stage | undefined): {
  stage: Stage
  label: string
  paths: string[]
  colour: string
} | null {
  if (!stage || stage === 'removed') return null
  return {
    stage,
    label: stageLabels[stage],
    paths: stageMarks[stage].paths,
    colour: stageMarks[stage].colour,
  }
}
