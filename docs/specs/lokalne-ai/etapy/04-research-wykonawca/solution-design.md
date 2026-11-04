# Etap 4: Research niezależny od wykonawcy OpenAI — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 4 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.5`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E04-R01–E04-R04. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

lib/companies/research.ts posiada komendy, migawkę celu, kolejkę, reuse/refresh, próby i publikację. lib/companies/research-provider.ts staje się wykonawcą OpenAI za małym ResearchExecutor; lib/companies/research-model.ts pozostaje właścicielem researchDraft, ResearchEvidence i validateResearch. Nie rozbijamy web_search na fikcyjny uniwersalny provider wyszukiwania.

## Decyzja E04-D01 — Wykonawca całego researchu OpenAI

**Propozycja:** Zastąpienie wbudowanego wyszukiwania ogólnym pojedynczym modelem nie zachowuje źródeł i kosztów. Kontrakt całego wykonania pozwala później dołączyć OpenCode bez przepisywania domeny.

Punkty integracji w obecnym katalogu: [lib/companies/research.ts](../../../../../lib/companies/research.ts), [lib/companies/research-provider.ts](../../../../../lib/companies/research-provider.ts), [lib/companies/research-model.ts](../../../../../lib/companies/research-model.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

Proponowany ResearchExecutor.execute({operationId,target,configuration},signal) zwraca {draft,evidence,accounting}. target odpowiada istniejącemu ResearchTarget, configuration jest zapisaną migawką. draft i evidence mają dokładne typy z research-model.ts; brak dowodów nie jest pustym udanym raportem.

accounting zawiera usage poszczególnych kroków, identyfikatory odpowiedzi i znany koszt albo null. Błąd wykonawcy również niesie dostępne accounting, aby nie zgubić kosztu pierwszego kroku. Nie przesyłać surowych odpowiedzi jako publicznych komunikatów błędu.

Wykonawca nie zapisuje firmy, raportu ani ai_attempts. Koordynator zawsze wywołuje validateResearch przed atomową publikacją i rozliczeniem próby. Publikacja sprawdza terminalny stan i blokuje ponowny efekt. OpenAI zachowuje dwa kroki oraz bieżący limit/cennik wyszukiwania; żadna reguła płatnego wykonawcy nie staje się globalnym limitem przyszłej Ollamy.

## Migracja i uruchomienie

Bez migracji, zmiany env i trasowania. researchConfiguration nadal rozpoznaje dotychczasowe modele. Stare rekordy recovery zachowują dotychczasową obsługę unknown. Nie dodajemy automatycznego researchu ani pogłębionego.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Atrapa OpenAI: te same dwa żądania, źródła, schemat i koszty.
2. Zły URL/cytat, brak źródeł, niekompletne tematy i odmowa.
3. Błąd drugiego kroku oraz nieznany koszt po pierwszym.
4. Integracja reuse/refresh, idempotencja komendy, restart i zachowanie poprzedniej wersji.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E04-AC01 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E04-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E04-AC03 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E04-AC04 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

Przed implementacją uzgodnić finalny kształt przenoszenia accounting z błędem. Nie wymaga decyzji o wyszukiwarce OpenCode (O-L2).

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.
