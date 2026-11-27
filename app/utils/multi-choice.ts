/**
 * Rules of the shared multi-choice filter (lq3 T4-R02, nq3 T1-R08): a
 * choice applies when the list closes, and nothing chosen means all. Pure
 * functions, so tests check them without a browser. Used by the component
 * MultiChoiceFilter on every page that filters by several values.
 */

/** One value of a multi-choice list with the label it shows. */
export type ChoiceOption<T extends string> = {
  value: T
  label: string
}

const sameChoice = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value) => b.includes(value))

/**
 * The choice a list applies when it closes: the ticked values when they
 * differ from the applied ones, in any order, or null when nothing changed.
 * Ticking while the list is open changes nothing.
 */
export function choiceOnClose<T extends string>(
  applied: readonly T[],
  ticked: readonly T[],
): T[] | null {
  return sameChoice(applied, ticked) ? null : [...ticked]
}

/** What the list's button says: all, one label or a count. */
export function choiceSummary(
  chosen: readonly string[],
  label: (value: string) => string,
): string {
  if (!chosen.length) return 'Wszystkie'
  return chosen.length === 1 ? label(chosen[0]!) : `Wybrano: ${chosen.length}`
}
