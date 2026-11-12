# Etap 1: Wspólna konfiguracja i budżet — Solution design

Status: **przegląd techniczny zakończony**, 2026-11-05. Etap 1 z dziewięciu, przygotowany do implementacji równoważnego wydzielenia. Beads `oferty-pracy-334.2` określa stan realizacji; przygotowanie: `oferty-pracy-334.19`. Projektowane pliki poniżej nie są deklaracją istniejącego kodu ani wykonanych testów.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Te wybory nie rozszerzają etapu 1 o nowe wykonanie lokalne.

Zakres normatywny zachowania: [Requirements](requirements.md), E01-R01–E01-R04. Stan sprawdzony: lokalny katalog z 2026-11-05, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Przy rozpoczęciu kodowania odświeżyć tę migawkę.

## Podejście i granice

Źródłem wydzielenia jest [lib/profile/ai.ts](../../../../../lib/profile/ai.ts). Na dzień przeglądu docelowe configuration.ts i budget.ts nie istnieją; robocze lib/ai/models/model.ts i openai.ts już istnieją.

| Projektowany plik | Własność i zależności |
| --- | --- |
| lib/ai/configuration.ts | AiConfiguration i aiConfiguration; istniejący strict parsing Zod i odczyt env przy każdym wywołaniu, bez cache. Korzysta z wewnętrznego parsera kwot. Nie importuje budget.ts, profilu ani adaptera OpenAI. |
| lib/ai/budget.ts | chargeCeiling, budgetMonth i reserve. Importuje AiConfiguration wyłącznie jako typ oraz wspólną arytmetykę. Nie tworzy klienta bazy ani kolejki. |
| lib/ai/money.ts | Wewnętrzne dla lib/ai przeniesione million, ceil, decimal i money; jeden parser dziesiętny współdzielony przez walidację konfiguracji i obliczenia. Bez zależności od konfiguracji, bazy i domeny. Konsumenci domenowi nie importują tych szczegółów. |

Przełączyć wszystkie bezpośrednie importy wspólnych symboli, również importy samych typów:

- lib/profile/ai.ts — korzysta z configuration.ts i budget.ts, zachowując pozostały kod profilu i rozpoczętą integrację modelu.
- lib/matching/store.ts, lib/matching/batch.ts i **lib/matching/list.ts** — ostatni plik pokazuje koszt w liście ofert i był pominięty w pierwotnym szkicu.
- lib/companies/research.ts i lib/companies/research-provider.ts.
- tests/profile.test.ts, tests/matching-batch.test.ts, tests/matching.integration.test.ts, tests/matching-groups.integration.test.ts, tests/company-research.integration.test.ts oraz tests/company-research.fixtures.ts.

matching/groups.ts na dzień przeglądu korzysta z finansowania przez matching/store.ts; nie ma własnego importu wspólnych symboli. Obejmuje go regresja grup, bez wymuszania nowej zależności. Importy executeAi, resumeAi i readAiProposal pozostają w profilu, także w testach i workerze. Przed zmianą ponowić wyszukiwanie konsumentów, gdyby katalog się zmienił. Wspólne moduły nie importują modułów domenowych; konfiguracja i budżet nie zależą od siebie cyklicznie.

## Decyzja E01-D01 — Przeniesienie istniejących funkcji bez nowej abstrakcji

Pozostawienie wspólnych funkcji w profilu utrzymuje zależność innych modułów od profilu. Wydzielamy istniejące zachowanie, bez nowego systemu operacji, repozytoriów ani interfejsu dostawców. Wewnętrzny money.ts zapobiega duplikowaniu parsera pomiędzy konfiguracją i obliczeniami; nie tworzy nowego interfejsu dla domeny. Zmiany reguł lokalnego kosztu zero należą do etapu 5.

Punkty integracji w obecnym katalogu: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/companies/research-provider.ts](../../../../../lib/companies/research-provider.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Kontrakty i niezmienniki etapu

Zachować publiczne sygnatury: aiConfiguration(variable = 'AI_PROFILE_PRICING_JSON'): AiConfiguration | null, chargeCeiling(config,input,output): string, budgetMonth(now?:Date): string, reserve(client:PoolClient,config:AiConfiguration,now?:Date,extraCost='0'): Promise<{month:string,cost:string,enough:boolean}>. Zmieniają się moduły importu, nie argumenty i znaczenie wyników.

AiConfiguration zachowuje model, version, inputUsdPerMillion, outputUsdPerMillion, usdPln, fxVersion, maxInputTokens i maxOutputTokens. Odczyt nadal wymaga OPENAI_API_KEY i wskazanej zmiennej *_PRICING_JSON. Pusty/błędny JSON, nieznane pola, niewłaściwe typy i niepoprawne kwoty dają null. Kwoty cennika i kurs muszą być dodatnie; maxInputTokens pozostaje dodatnim integerem do 2 000 000, maxOutputTokens do 6 000. Nie wprowadzamy tu konfiguracji Ollamy ani nowych env. Ograniczenia specyficzne dla matchingConfiguration i researchConfiguration zostają przy ich dotychczasowych właścicielach.

Kwoty są dziesiętnymi stringami i bigint w milionowych częściach. Zachować dotychczasowy parser (1–6 cyfr części całkowitej, opcjonalnie 1–6 cyfr ułamka), dwa kroki zaokrąglenia w górę i wynik z sześcioma miejscami po przecinku. Nie rozszerzać formatów wejścia ani nie zmieniać zaokrągleń przy przenoszeniu. chargeCeiling odrzuca ujemne, ułamkowe i niebezpieczne całkowite użycie tokenów, ale dopuszcza użycie zero.

**reserve nie zapisuje rezerwacji samodzielnie.** W transakcji rozpoczętej przez wywołującego tworzy w razie potrzeby miesiąc z dotychczasowym limitem 100 PLN, blokuje wiersz miesiąca FOR UPDATE i sprawdza dostępność na podstawie ai_attempts: actual_pln dla settled, reserved_pln dla pozostałych stanów. Koszt obejmuje chargeCeiling dla zapisanych pułapów tokenów i extraCost, zwracany jest także przy enough=false.

Wywołujący w tej samej transakcji zapisuje ai_attempts oraz zleca pracę przy użyciu tego samego klienta SQL. Blokada trwa do commit/rollback wywołującego. reserve nie wykonuje BEGIN/COMMIT/ROLLBACK, nie zwalnia klienta, nie wysyła pracy i nie wykonuje HTTP. Nie zmieniać kolejności finansowania ani savepointu all-or-none grup. Miesiąc wyznaczany jest w Europe/Warsaw i utrwalany przez wywołującego; rozliczenie zachowuje miesiąc próby, zamiast wyznaczać go ponownie. SQL i schemat danych pozostają bez zmian.

Przełączenie jest lokalne i atomowe w obrębie zmiany: końcowy stan nie zostawia wspólnych symboli jako re-eksportów z profilu. Nie tworzyć ogólnego barrel export łączącego wspólny budżet z adapterami modeli lub domeną.

## Migracja i uruchomienie

Brak migracji i nowych env, zmiany payloadów OpenAI, stanów prób, polityki retry, archiwum i publikacji. Cofnięcie samego wydzielenia nie wymaga zmiany danych; ewentualny revert musi zachować niezależne zastane zmiany adaptera. Obecne queued/waiting_budget próby korzystają z tych samych zapisanych konfiguracji. Etap jest częścią jednego wspólnego wdrożenia epiku, nie osobnym wydaniem.

## Weryfikacja

Poniższe próby są warunkami zakończenia implementacji, nie wykonanym wynikiem tego przeglądu. Sprawdzenia HTTP używają atrap, bez płatnych wywołań. Testy PostgreSQL mają własne izolowane schematy i wymagają RUN_INTEGRATION=1; bez tej flagi pominięte testy nie stanowią dowodu spełnienia kryteriów.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E01-AC01 | Macierz odczytu wszystkich trzech *_PRICING_JSON: poprawna konfiguracja, brak klucza/env, pusty/błędny JSON, obce pole, zły typ, zerowy lub błędny cennik/kurs, granice tokenów. Odczyt kolejnej zmiany env nie zwraca cache poprzedniej. Regresja dodatkowych ograniczeń researchConfiguration w tests/company-research.test.ts. Kontrola importów obejmuje także listę ofert i fixtures. |
| E01-AC02 | Zachować asercje kwot i strefy z tests/profile.test.ts; sprawdzić zero użycia, zaokrąglenie niepełnej milionowej części oraz odrzucenie ułamków, wartości ujemnych i ponad MAX_SAFE_INTEGER. Koszt i searchFee/researchCeiling pozostają zgodne z tests/company-research.test.ts. Testować publiczne funkcje, bez osobnego testowania prostych delegacji. |
| E01-AC03 | tests/profile.integration.test.ts: równoległe importy i rollback przy null kolejki; tests/matching-groups.integration.test.ts: finansowanie całej grupy albo żadnej pozycji; tests/matching.integration.test.ts i tests/company-research.integration.test.ts: wspólny budżet i zachowana rezerwa unknown. Uzupełnić sprawdzenie rozliczenia przez granicę miesiąca, jeśli brakuje takiej asercji. |
| E01-AC04 | Regresje tests/profile.integration.test.ts, tests/matching.integration.test.ts, tests/matching-groups.integration.test.ts, tests/company-research.integration.test.ts; koszty listy w tests/matching-list.integration.test.ts oraz transport/archiwum w tests/matching-batch.test.ts i tests/matching-archive.integration.test.ts. Bez nowej rewizji profilu/oceny/raportu wynikającej z samego wydzielenia. |

Brakującą macierz konfiguracji i przypadki arytmetyki umieścić w testach wspólnego AI, np. tests/ai-configuration.test.ts i tests/ai-budget.test.ts. Istniejące testy kwot można przenieść z profilu zamiast je dublować. Wskazane nazwy nowych testów są organizacją implementacji, nie nowym kontraktem domenowym.

Warunki jakości implementacji, zgodnie z [README](../../../../../README.md): `pnpm check`, `pnpm build`, a następnie potrzebne integracje z RUN_INTEGRATION=1; testy HTTP profilu wymagają świeżego builda. Projekt udostępnia te polecenia także przez docker compose run --rm tools. Nie włączać równoległego wykonywania plików integracyjnych: PostgreSQL advisory locks są globalne dla bazy, co uwzględnia vitest.config.ts.

Standardowa ścieżka projektu na przygotowanym środowisku Compose (polecenia wykonuje się podczas implementacji, nie w ramach przeglądu dokumentacji):

```sh
docker compose run --rm tools pnpm check
docker compose run --rm tools pnpm build
docker compose run --rm -e RUN_INTEGRATION=1 tools pnpm test
```

Przed edycją kodu zapisać bazowe wyniki sprawdzeń dla zastanego katalogu. Jeżeli niedokończony adapter już powoduje błąd, odróżnić go od regresji wydzielenia, zachować dowód i przypisać naprawę do właściwego zakresu etapu 2. Nie naprawiać adaptera po cichu w etapie 1 ani nie opisywać nieprzechodzącego sprawdzenia jako sukcesu. Blokadę środowiska i niewykonany zakres podać w Beads.

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Wynik przeglądu i warunki rozpoczęcia

O-L4 dla tego etapu wykonano 2026-11-05: porównano kontrakty z lib/profile/ai.ts, konsumentami i istniejącymi testami. Doprecyzowano współdzielony parser, brakujący import w liście ofert, obowiązki wywołującego reserve oraz obserwowalne kryteria odbioru. Nie zmieniono zachowania produktu ani zakresu etapu.

Nie ma otwartej materialnej decyzji blokującej implementację etapu 1. Bramki lokalnego runtime T01–T05 nie są jego zależnością. Aktualny stan wykonania pozostaje w Beads; ten przegląd nie zamyka zadania implementacyjnego i nie uruchamia kodowania.
