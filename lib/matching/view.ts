export const matchingPending = [
  'waiting_budget',
  'queued',
  'uploading',
  'submitting',
  'submitted',
] as const
export const matchingStateLabels: Record<string, string> = {
  waiting_budget: 'Czeka na budżet',
  queued: 'W kolejce',
  uploading: 'Przesyłanie',
  submitting: 'Zlecanie',
  submitted: 'Czeka na Batch',
  completed: 'Ocena gotowa',
  failed: 'Błąd oceny',
  unknown: 'Wymaga sprawdzenia',
  excluded: 'Niezgodność wymagań',
}
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
