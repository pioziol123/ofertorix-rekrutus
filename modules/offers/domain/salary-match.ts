import type { OfferView } from '../offer-view.ts'
import type { Filters } from './filters.ts'

/**
 * Compares the offer's salary variants with the salary filters: whether the
 * offer matches, whether it matches only partly and whether its salary is
 * unknown for these filters.
 */
export function salaryMatch(
  offer: OfferView,
  f: Filters,
): { matches: boolean; partial: boolean; unknown: boolean } {
  const variants = offer.salaries.filter(
    (s) =>
      (!f.contract || s.contract === f.contract) &&
      (!f.currency || s.currency === f.currency || s.currency === null) &&
      (!f.period || s.period === f.period || s.period === null),
  )
  if (!variants.length)
    return {
      matches:
        offer.salaries.length === 0 && f.includeUnknownSalary && !f.contract,
      partial: false,
      unknown: true,
    }
  let partial = false,
    unknown = false,
    matches = false
  for (const s of variants) {
    const uncertain =
      s.origin === 'portal_estimate' ||
      s.origin === 'unknown' ||
      s.currency === null ||
      s.period === null ||
      (s.from === null && s.to === null)
    if (uncertain) {
      unknown = true
      if (f.includeUnknownSalary) matches = true
      continue
    }
    if (f.minSalary === null) {
      matches = true
      continue
    }
    if (s.to !== null && s.to < f.minSalary) continue
    if (s.from !== null && s.from >= f.minSalary) {
      matches = true
      continue
    }
    if (s.to !== null) {
      matches = true
      partial = true
      continue
    }
    unknown = true
    if (f.includeUnknownSalary) matches = true
  }
  return { matches, partial, unknown }
}
