// Form drafts may keep salary values while that optional filter is switched off.
export function offerFilterQuery(
  form: Record<string, string | number>,
  salaryEnabled: boolean,
): Record<string, string> {
  const salaryKeys = new Set([
    'minSalary',
    'currency',
    'period',
    'includeUnknownSalary',
  ])
  return Object.fromEntries(
    Object.entries(form)
      .filter(
        ([key, value]) =>
          String(value).trim() !== '' &&
          (salaryEnabled || !salaryKeys.has(key)),
      )
      .map(([key, value]) => [key, String(value).trim()]),
  )
}
export function hasSalaryFilter(query: Record<string, unknown>): boolean {
  return (
    ['minSalary', 'currency', 'period'].some(
      (key) => typeof query[key] === 'string' && query[key].trim() !== '',
    ) || query.includeUnknownSalary === 'false'
  )
}
