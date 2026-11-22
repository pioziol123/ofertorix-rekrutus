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
/**
 * The texts of the offer list's bulk assessment. Each selected offer is
 * assessed by its own assignment, funded on its own (T8-R01, T8-R02), so
 * no text names a shared batch, the Batch price list or a group waiting
 * for the budget (T8-R04).
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-2): the wording of the reservation
 * note and of the failed command; the configuration note is the one the
 * offer details already show.
 */
export const matchingBulkTexts = {
  reservation: (amount: string) =>
    `Maksymalna rezerwacja: ${amount} zł. Każda oferta jest oceniana osobno.`,
  notConfigured: 'Oceny AI wymagają konfiguracji modelu i cennika.',
  notConfirmed:
    'Nie udało się potwierdzić zlecenia. Możesz spróbować ponownie z tym samym zaznaczeniem — nie zleci to tych ocen drugi raz.',
  repeated: 'To zlecenie zostało już przyjęte; nie wysłano ponownie.',
  /** The message of a command accepted now, from its items alone. */
  accepted: (items: { reused: boolean; state: string }[]) =>
    `Zlecenie zapisane: ${items.length} ofert. Już oczekujące: ${items.filter((i) => i.reused).length}. Niezgodne z wymaganiami: ${items.filter((i) => i.state === 'excluded').length}.`,
} as const
/**
 * The link of an assessment's history entry to what was sent to the
 * provider and what came back (T8-R07): the exchange of its assignment's
 * operations, or, for an assessment of the old way, the archive of its
 * provider batch, whose text stays until task oferty-pracy-sq2.11.
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-2): the text of the exchange link.
 */
export const matchingExchangeLink = (assignment: boolean) =>
  assignment
    ? 'Pobierz zapis wymiany z dostawcą (JSON)'
    : 'Pobierz archiwum całej partii (JSON)'
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
