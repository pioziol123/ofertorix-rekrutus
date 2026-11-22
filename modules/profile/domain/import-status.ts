/**
 * The owner's label of each status of a CV import, as the profile page
 * shows it. A preparation shows only "Przygotowywanie propozycji" while its
 * assignment is in progress or needs attention, and "Propozycja gotowa" or
 * "Wymaga sprawdzenia" at its end (T7-R04).
 */
export const importStatusLabels: Readonly<Record<string, string>> = {
  receiving: 'Zapisywanie pliku',
  queued: 'Czeka na odczyt',
  extracting: 'Odczytywanie CV',
  ready: 'Tekst gotowy',
  needs_text: 'Wklej tekst CV',
  failed: 'Błąd importu',
  source_missing: 'Brak pliku źródłowego',
  needs_configuration: 'Wymaga konfiguracji AI',
  ai_running: 'Przygotowywanie propozycji',
  proposal: 'Propozycja gotowa',
  needs_attention: 'Wymaga sprawdzenia',
}

/** The owner's label of an import status; an unknown one is shown as it is. */
export const importStatusLabel = (status: string): string =>
  importStatusLabels[status] ?? status
