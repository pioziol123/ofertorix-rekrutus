import { matchingPending } from '../../../lib/matching/view.ts'
import type { OfferView } from '../offer-view.ts'
import type { Filters } from './filters.ts'
import { salaryMatch } from './salary-match.ts'

const lower = (v: string) => v.toLocaleLowerCase('pl')

/**
 * Filters, sorts and pages the offers and builds the filter options from
 * the whole catalog. A page shows 20 offers without description and history.
 */
export function filterOffers(offers: OfferView[], f: Filters) {
  const wanted = f.technology
    .split(',')
    .map((s) => lower(s.trim()))
    .filter(Boolean)
  const matches = offers.filter((o) => {
    const a = o.assessment
    if (f.assessmentState) {
      if (f.assessmentState === 'unassessed' && a) return false
      if (
        f.assessmentState === 'pending' &&
        !matchingPending.some((s) => s === a?.state)
      )
        return false
      if (f.assessmentState === 'current' && (!a?.scoreId || a.stale))
        return false
      if (f.assessmentState === 'stale' && (!a?.scoreId || !a.stale))
        return false
      if (
        ['failed', 'excluded', 'unknown'].includes(f.assessmentState) &&
        a?.state !== f.assessmentState
      )
        return false
    }
    const limits = [
      [f.minRating, a?.rating],
      [f.minCompleteness, a?.completeness],
      [f.minTechnologies, a?.components.technologies],
      [f.minExperience, a?.components.experience],
      [f.minConditions, a?.components.conditions],
      [f.minDirection, a?.components.direction],
    ] as const
    if (
      limits.some(
        ([limit, value]) =>
          limit !== null &&
          (!a?.scoreId ||
            (a.stale && f.assessmentState !== 'stale') ||
            value === null ||
            value === undefined ||
            value < limit),
      )
    )
      return false

    if (
      f.q &&
      !lower(
        [o.title, o.company, ...o.skills.map((s) => s.name)].join(' '),
      ).includes(lower(f.q))
    )
      return false
    const skills = o.skills
      .filter(
        (s) =>
          f.skillType === 'all' || s.optional === (f.skillType === 'optional'),
      )
      .map((s) => lower(s.name))
    if (wanted.length) {
      const checks = wanted.map((t) => skills.includes(t))
      if (f.technologyMode === 'any' && !checks.some(Boolean)) return false
      if (f.technologyMode === 'all' && !checks.every(Boolean)) return false
      if (f.technologyMode === 'excluded' && checks.some(Boolean)) return false
    }
    if (
      f.location &&
      !o.locations.some((l) => lower(l).includes(lower(f.location)))
    )
      return false
    if (
      f.mode &&
      (f.mode === 'unknown'
        ? o.mode !== null
        : o.mode !== f.mode &&
          !(
            o.mode === 'remote-hybrid' && ['remote', 'hybrid'].includes(f.mode)
          ))
    )
      return false
    if (
      (f.hours && o.hours !== f.hours) ||
      (f.seniority && o.seniority !== f.seniority)
    )
      return false
    if (
      f.availability &&
      (f.availability === 'expired'
        ? !o.expired
        : o.availability !== f.availability)
    )
      return false
    if (
      (f.minSalary !== null ||
        f.currency ||
        f.period ||
        f.contract ||
        !f.includeUnknownSalary) &&
      !salaryMatch(o, f).matches
    )
      return false
    return true
  })
  matches.sort((a, b) => {
    let result = 0
    if (f.sort === 'rating') {
      const current = (o: OfferView) =>
        o.assessment?.scoreId &&
        !o.assessment.stale &&
        o.assessment.rating !== null
          ? o.assessment.rating
          : null
      const av = current(a),
        bv = current(b)
      result = av === null ? (bv === null ? 0 : 1) : bv === null ? -1 : bv - av
    }
    if (f.sort === 'title' || f.sort === 'company')
      result = a[f.sort].localeCompare(b[f.sort], 'pl')
    if (f.sort === 'newest' || f.sort === 'oldest')
      result =
        a.firstSeen.localeCompare(b.firstSeen) * (f.sort === 'newest' ? -1 : 1)
    if (f.sort === 'published')
      result = (b.published ?? '').localeCompare(a.published ?? '')
    return result || a.id.localeCompare(b.id)
  })
  const total = matches.length
  const page = Math.min(f.page, Math.max(1, Math.ceil(total / 20)))
  const values = (fn: (o: OfferView) => (string | null)[]) =>
    [...new Set(offers.flatMap(fn).filter((s): s is string => !!s))].sort(
      (a, b) => a.localeCompare(b, 'pl'),
    )
  return {
    items: matches.slice((page - 1) * 20, page * 20).map((o) => ({
      ...o,
      description: undefined,
      revisions: undefined,
      salaryStatus: salaryMatch(o, f),
    })),
    total,
    page,
    pageSize: 20,
    filters: f,
    options: {
      technologies: values((o) => o.skills.map((s) => s.name)),
      contracts: values((o) => o.salaries.map((s) => s.contract)),
      currencies: values((o) => o.salaries.map((s) => s.currency)),
      periods: values((o) => o.salaries.map((s) => s.period)),
      hours: values((o) => [o.hours]),
      seniorities: values((o) => [o.seniority]),
    },
  }
}
