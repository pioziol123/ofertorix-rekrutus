export const jobspyCatalog = {
  indeed: {
    name: 'Indeed',
    prefix: 'in-',
    hosts: ['indeed.com'],
    scope: 'poland',
    restriction: 'review',
    reason:
      'Import ręczny przez GraphQL. PHP i poziom seniority wymagają sprawdzenia; wyniki nie obejmują całego portalu.',
  },
  linkedin: {
    name: 'LinkedIn',
    prefix: 'li-',
    hosts: ['linkedin.com'],
    scope: 'poland',
    restriction: 'requires_access',
    reason:
      'Zgoda właściciela potwierdzona (maks. 1 żądanie/s). Import ręczny; szczegóły i ponowienia wliczają się do limitu.',
  },
  bayt: {
    name: 'Bayt',
    prefix: 'bayt-',
    hosts: ['bayt.com'],
    scope: 'poland',
    restriction: 'review',
    reason:
      'Próba dla Polski potwierdzona. Portal zwraca też luźno powiązane wyniki; PHP i seniority wymagają sprawdzenia.',
  },
  glassdoor: {
    name: 'Glassdoor',
    prefix: 'gd-',
    hosts: ['glassdoor.com', 'glassdoor.co.uk', 'glassdoor.de', 'glassdoor.fr'],
    scope: 'remote',
    restriction: 'review',
    reason:
      'Rynek UK; import ofert zdalnych, dostępność pracy z Polski oceniana osobno.',
  },
  zip_recruiter: {
    name: 'ZipRecruiter',
    prefix: 'zr-',
    hosts: ['ziprecruiter.com'],
    scope: 'remote',
    restriction: 'review',
    reason:
      'Rynek USA; import ofert zdalnych, bez założenia dostępności z Polski.',
  },
  naukri: {
    name: 'Naukri',
    prefix: 'nk-',
    hosts: ['naukri.com'],
    scope: 'remote',
    restriction: 'review',
    reason:
      'Rynek Indii; import ofert zdalnych, bez założenia dostępności z Polski.',
  },
  bdjobs: {
    name: 'BDJobs',
    prefix: 'bd-',
    hosts: ['bdjobs.com'],
    scope: 'remote',
    restriction: 'review',
    reason:
      'Rynek Bangladeszu; import ofert zdalnych, dostępność z Polski wymaga sprawdzenia.',
  },
  hellowork: {
    name: 'HelloWork',
    prefix: 'hw-',
    hosts: ['hellowork.com'],
    scope: 'remote',
    restriction: 'review',
    reason:
      'Rynek Francji; import ofert w pełni zdalnych, dostępność z Polski oceniana osobno.',
  },
  google: {
    name: 'Google Jobs',
    prefix: 'go-',
    hosts: ['google.com'],
    scope: 'poland',
    restriction: 'unavailable',
    reason: 'JobSpy deklaruje źródło jako niedostępne.',
  },
} as const
export type JobspySource = keyof typeof jobspyCatalog
export const jobspySources = Object.keys(jobspyCatalog) as JobspySource[]
export function parseJobspySource(value: string): JobspySource {
  if (!Object.hasOwn(jobspyCatalog, value))
    throw new Error('Unknown JobSpy source')
  return value as JobspySource
}
export function configuredSources(): JobspySource[] {
  const raw = process.env.JOBSPY_SOURCES ?? ''
  return [
    ...new Set(
      raw
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map(parseJobspySource),
    ),
  ]
}
export function sourceEnabled(source: JobspySource): boolean {
  if (source === 'indeed') return process.env.JOBSPY_ENABLED === 'true'
  const meta = jobspyCatalog[source]
  if (meta.restriction === 'unavailable') return false
  if (
    meta.restriction === 'requires_access' &&
    process.env.JOBSPY_LINKEDIN_ACCESS_CONFIRMED !== 'true'
  )
    return false
  return configuredSources().includes(source)
}

export const remoteMarkets = {
  glassdoor: 'uk',
  zip_recruiter: 'usa',
  naukri: 'india',
  bdjobs: 'bangladesh',
  hellowork: 'france',
} as const
export function remoteMarket(source: JobspySource): string | null {
  return remoteMarkets[source as keyof typeof remoteMarkets] ?? null
}
