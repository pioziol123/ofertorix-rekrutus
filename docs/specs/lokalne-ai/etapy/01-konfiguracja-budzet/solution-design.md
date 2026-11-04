# Etap 1: Wspólna konfiguracja i budżet — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 1 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.2`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E01-R01–E01-R04. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Przenieść aiConfiguration i AiConfiguration do lib/ai/configuration.ts, a arytmetykę oraz reserve do lib/ai/budget.ts. To proponowane nowe pliki; źródłem jest lib/profile/ai.ts. Przełączyć importy w lib/matching/{batch,store,groups}.ts i lib/companies/{research,research-provider}.ts oraz testach. Moduły wspólne nie importują modułów domenowych.

## Decyzja E01-D01 — Przeniesienie istniejących funkcji bez nowej abstrakcji

**Propozycja:** Pozostawienie ich w profilu utrzymuje zależność innych modułów od profilu. Jednoczesna zmiana reguł kosztowych utrudniłaby wykazanie równoważności; odkładamy ją do etapu 5.

Punkty integracji w obecnym katalogu: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/companies/research-provider.ts](../../../../../lib/companies/research-provider.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

Zachować publiczne sygnatury: aiConfiguration(variable = 'AI_PROFILE_PRICING_JSON'): AiConfiguration | null, chargeCeiling(config,input,output): string, budgetMonth(now?): string, reserve(client,config,now?,extraCost='0'). Typ AiConfiguration i strict parsing pozostają dokładnie jak w aktualnym kodzie. Kwoty to dziesiętne ciągi i arytmetyka bigint w milionowych częściach; bez float. Nieprawidłowe użycie tokenów nadal jest błędem.

reserve korzysta z PoolClient przekazanego przez wywołującego, blokuje wiersz miesiąca i zwraca {month,cost,enough}; nie zatwierdza cudzej transakcji. HTTP pozostaje poza transakcją. Brak zmiany SQL i domyślnego budżetu 100 PLN. Zasady lokalnego kosztu zero wchodzą dopiero w etapie 5.

Tymczasowe re-eksporty mogą ułatwić przełączenie, lecz końcowy stan etapu ma jeden właścicielski moduł konfiguracji i jeden budżetu, bez zależności infrastruktury od profilu.

## Migracja i uruchomienie

Brak migracji i nowych env. Wdrożenie równoważnego kodu; cofnięcie wydzielenia nie wymaga zmiany danych. Zachować wszystkie istniejące niezacommitowane zmiany.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Testy konfiguracji: zgodne i błędne dane, każdy dotychczasowy konsument.
2. Testy kwot: zaokrąglenia, zero użycia, granice bezpiecznych liczb; porównanie z obecną implementacją.
3. Integracje PG: równoległe rezerwacje, granica miesiąca, nieznany koszt.
4. Regresje profilu, matching, groups i research z atrapą HTTP; pnpm check.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E01-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E01-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E01-AC03 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E01-AC04 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

Brak otwartej decyzji technicznej blokującej przygotowanie refaktoru. Wymagany przegląd pary (O-L4).

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.
