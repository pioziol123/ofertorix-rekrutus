# Etap 2: Profil niezależny od protokołu OpenAI — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 2 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.3`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E02-R01–E02-R04. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Profil posiada przygotowanie instrukcji, factSchema i checkProposal. Nowy lib/ai/models/openai.ts posiada HTTP Responses i normalizację wyniku. Mały kontrakt pojedynczej odpowiedzi znajduje się w lib/ai/models/model.ts. Nie obejmuje Batch, narzędzi, sesji ani publikowania profilu. lib/profile/ai.ts pozostaje koordynatorem zapisu próby i propozycji.

## Decyzja E02-D01 — Mały kontrakt strukturalnego wyniku

**Propozycja:** Przekazanie surowego Responses do domeny zachowałoby sprzężenie; ogólny framework narzędzi i agentów rozszerzałby interfejs poza potrzeby profilu.

Punkty integracji w obecnym katalogu: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [lib/profile/model.ts](../../../../../lib/profile/model.ts), [lib/profile/imports.ts](../../../../../lib/profile/imports.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

Proponowany kontrakt StructuredModel.generate(request, signal): Promise<ModelResult>. request zawiera model:string, instructions:string, input:string, schema: obiekt JSON Schema oraz parametry istniejącego wykonania OpenAI. Wszystkie pola wymagane; pusty input jest odrzucany przed HTTP. signal służy przerwaniu, nie określa nowego deadline.

ModelResult rozróżnia outcome: completed | refused | incomplete. Tylko completed zawiera text:string z jedną treścią końcową; pozostałe mają text:null. usage ma inputTokens/outputTokens jako nieujemne bezpieczne liczby całkowite lub null (każde osobno); responseId:string|null. Nieobecna telemetria jest normalizowana do null. Błędy transportu mają kody network | http | format, bez surowego body w komunikacie domenowym. Adapter nie interpretuje cytatów.

readAiProposal rozdzielić na normalizację Responses w adapterze i odczyt JSON + checkProposal w profilu. Przed usunięciem starego wejścia sprawdzić konsumentów/testy. Zachować obecny payload OpenAI (w tym parametry limitów tej płatnej ścieżki), rezerwację i przejścia ai_attempts. Brak telemetrii jest przekazywany do istniejącego rozliczenia nieznanego kosztu, nie wyliczany z długości tekstu.

## Migracja i uruchomienie

Bez migracji i zmian env. Dotychczasowe migawki konfiguracji i queued próby korzystają z adaptera OpenAI. Nie zmieniamy historycznych wyników. Nową neutralną konfigurację wprowadzi etap 5.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Kontrakt HTTP OpenAI: porównać wysyłany payload z dotychczasowym; atrapa fetch.
2. Macierz odmowa/niepełny/wiele treści/JSON/cytaty/network oraz brak usage.
3. Integracja przygotowanie → wykonanie → propozycja → zatwierdzenie i konflikt rewizji.
4. Ponowne dostarczenie ukończonej próby nie zmienia profilu ani kosztu drugi raz.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E02-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E02-AC02 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E02-AC03 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E02-AC04 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

Nazwy typów są propozycją do przeglądu. Kontrakt ma obsługiwać wyłącznie potrzebę strukturalnej odpowiedzi; rozszerzenie Ollamy w etapie 5 nie uzasadnia narzędzi ani sesji w tym interfejsie.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.
