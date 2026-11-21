/**
 * The states of an assessment request the owner sees: the stage of its AI
 * work, or `excluded` when a required condition conflicts and nothing
 * was requested.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-3): one in-progress state replaces the
 * steps of the former batch path.
 */
export const matchingStates = [
  'waiting_budget',
  'queued',
  'running',
  'completed',
  'failed',
  'unknown',
  'excluded',
] as const
export type MatchingState = (typeof matchingStates)[number]
export const matchingPending = [
  'waiting_budget',
  'queued',
  'running',
] as const satisfies readonly MatchingState[]
export const matchingStateLabels: Record<string, string> = {
  waiting_budget: 'Czeka na budżet',
  queued: 'W kolejce',
  running: 'Ocena w toku',
  completed: 'Ocena gotowa',
  failed: 'Błąd oceny',
  unknown: 'Wymaga sprawdzenia',
  excluded: 'Niezgodność wymagań',
} satisfies Record<MatchingState, string>
/**
 * The labels of the offer details for the state of an assessment request.
 * An assessment with an assignment reaches only "Ocena w toku", "Ocena
 * gotowa", "Ocena nie powiodła się" and the exclusion (T8-R04); the labels
 * of waiting for the budget, of the queue and of a send or cost to check
 * stay for assessments of the old way until task oferty-pracy-sq2.11.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-3): one in-progress state replaces the
 * steps of the former batch path.
 */
export const matchingDetailLabels: Record<string, string> = {
  waiting_budget: 'Czeka na budżet',
  queued: 'W kolejce',
  running: 'Ocena w toku',
  completed: 'Ocena gotowa',
  failed: 'Ocena nie powiodła się',
  unknown: 'Wysyłka lub koszt wymagają sprawdzenia',
  excluded: 'Niezgodność z wymaganiem koniecznym',
} satisfies Record<MatchingState, string>
export const matchingGroupLabels = {
  technologies: 'Technologie',
  experience: 'Doświadczenie',
  conditions: 'Warunki',
  direction: 'Kierunek zawodowy',
} as const
export type MatchingSummary = {
  requestId: string | null
  state: string
  scoreId: string | null
  author?: 'ai' | 'owner'
  rating: number | null
  completeness: number | null
  stale: boolean
  components: Record<keyof typeof matchingGroupLabels, number | null>
}

export function matchingCriterionLabel(label: string) {
  const labels: Record<string, string> = {
    location: 'Lokalizacja',
    workMode: 'Tryb pracy',
    officeDays: 'Dni w biurze',
    hours: 'Wymiar czasu pracy',
    languages: 'Języki',
    timeZone: 'Strefa czasowa',
    onCall: 'Dyżury',
    companyType: 'Typ firmy',
    projectType: 'Typ projektu',
    polandEligibility: 'Możliwość pracy z Polski',
    roles: 'Docelowe role',
    seniority: 'Docelowy poziom doświadczenia',
    technologies: 'Kierunek technologiczny',
    description: 'Kierunek rozwoju',
  }
  const [key, ...rest] = label.split(':')
  return (labels[key!] ?? key) + (rest.length ? ':' + rest.join(':') : '')
}
