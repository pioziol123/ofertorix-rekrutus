import { jobspyCatalog } from './jobspy-catalog.ts'
import { polishCatalog } from './polish-catalog.ts'

/**
 * The display name of every catalogue source (T1 approach, item 1). The
 * JobSpy and Polish portals keep theirs in their own catalogues; SOLID.Jobs
 * and Himalayas have theirs here. A source without a name shows its id.
 */
const ownNames: Record<string, string> = {
  'solid-jobs': 'SOLID.Jobs',
  himalayas: 'Himalayas',
}

export function sourceName(source: string): string {
  if (Object.hasOwn(ownNames, source)) return ownNames[source]!
  if (Object.hasOwn(jobspyCatalog, source))
    return jobspyCatalog[source as keyof typeof jobspyCatalog].name
  if (Object.hasOwn(polishCatalog, source))
    return polishCatalog[source as keyof typeof polishCatalog].name
  return source
}
