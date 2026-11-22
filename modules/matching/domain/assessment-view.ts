/**
 * The states of an assessment request the owner sees (T8-R04): in progress
 * while its assignment is in progress or needs attention, completed or
 * failed at its end, or `excluded` when a required condition conflicts
 * and nothing was requested.
 */
export const matchingStates = [
  'running',
  'completed',
  'failed',
  'excluded',
] as const
export type MatchingState = (typeof matchingStates)[number]
export const matchingPending = [
  'running',
] as const satisfies readonly MatchingState[]
/** The short labels of the offer list; a failed assessment keeps "Błąd oceny". */
export const matchingStateLabels: Record<string, string> = {
  running: 'Ocena w toku',
  completed: 'Ocena gotowa',
  failed: 'Błąd oceny',
  excluded: 'Niezgodność wymagań',
} satisfies Record<MatchingState, string>
/** The labels of the offer details for the state of an assessment request. */
export const matchingDetailLabels: Record<string, string> = {
  running: 'Ocena w toku',
  completed: 'Ocena gotowa',
  failed: 'Ocena nie powiodła się',
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
 * operations. An assessment made before the deployment of assignments has
 * none (T10-R08).
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-2): the text of the exchange link.
 */
export const matchingExchangeLink = 'Pobierz zapis wymiany z dostawcą (JSON)'
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
