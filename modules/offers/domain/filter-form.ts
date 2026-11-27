/**
 * The list's address from the filter form. Form drafts may keep salary
 * values while that optional filter is switched off. A key of several
 * values, the stage filter (lq3 T3-R05), goes comma-separated, as on the
 * page "Synchronizacje"; nothing chosen leaves the key out.
 */
export function offerFilterQuery(
  form: Record<string, string | number | readonly string[]>,
  salaryEnabled: boolean,
): Record<string, string> {
  const salaryKeys = new Set([
    'minSalary',
    'currency',
    'period',
    'includeUnknownSalary',
  ])
  const text = (value: string | number | readonly string[]) =>
    typeof value === 'object' ? value.join(',') : String(value).trim()
  return Object.fromEntries(
    Object.entries(form)
      .map(([key, value]) => [key, text(value)] as const)
      .filter(
        ([key, value]) =>
          value !== '' && (salaryEnabled || !salaryKeys.has(key)),
      ),
  )
}
export function hasSalaryFilter(query: Record<string, unknown>): boolean {
  return (
    ['minSalary', 'currency', 'period'].some(
      (key) => typeof query[key] === 'string' && query[key].trim() !== '',
    ) || query.includeUnknownSalary === 'false'
  )
}
