# Etap 3: Oceny oddzielone od OpenAI Batch — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 3 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.4`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E03-R01–E03-R05. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Wyodrębnić lib/matching/task.ts dla instrukcji/schematu i neutralnego zadania oraz lib/matching/publication.ts dla walidacji/publikacji. Nazwy proponowane. BatchClient i jego archiwum pozostają w adapterze OpenAI; store.ts/groups.ts koordynują istniejący cykl i komendy. Grupa domenowa nie jest tożsama z plikiem lub partią dostawcy.

## Decyzja E03-D01 — Odrębne zadanie oceny i adapter Batch

**Propozycja:** Przeniesienie całego store do wspólnego AI zgubiłoby reguły domenowe. Emulacja Batch dla przyszłej Ollamy nie jest potrzebna; zachowujemy protokół tylko dla jego rzeczywistego dostawcy.

Punkty integracji w obecnym katalogu: [lib/matching/batch.ts](../../../../../lib/matching/batch.ts), [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/matching/groups.ts](../../../../../lib/matching/groups.ts), [lib/matching/archive.ts](../../../../../lib/matching/archive.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

MatchingTask zawiera requestId:UUID, input:MatchingInput, inputVersion/promptVersion jako niepuste znaczniki istniejących wersji oraz schema wywiedziony z assessmentSchema. Odczyt wersji wejść z matching_requests pozostaje autorytatywny; nie rekonstruować danych z aktualnego profilu podczas odbioru.

Adapter Batch tłumaczy task na obecną linię {custom_id,method:'POST',url:'/v1/responses',body}. Zachować istniejące ograniczenia płatnego Batch, identyfikatory, pliki i kontrolę archiwum. Odebrana linia przechodzi normalizację do {requestId, outcome, text|null, usage, responseId|null}, gdzie outcome rozróżnia completed/refused/incomplete/error; schema i dowody sprawdza domena.

Publikacja blokuje rekord zlecenia i atomowo zapisuje jego wynik, rewizję oceny oraz rozliczenie. Dla terminalnego zlecenia zwraca już zapisany rezultat bez kolejnej rewizji. applyMatchingLine pozostaje fasadą zgodności, dopóki wszyscy konsumenci nie przejdą na wyodrębnioną funkcję. Nie zmieniać reguł aktualności ani ręcznej historii.

W tym etapie matching_batches nadal tworzy się tak jak obecnie, również dla pojedynczej oceny. Rozdzielenie kodu nie wprowadza jeszcze nullable payloadów ani nowej maszyny stanów.

## Migracja i uruchomienie

Brak migracji stanów i rekordów. Dotychczasowe waiting_budget/queued/uploading/submitting/submitted i stany końcowe zachowują znaczenie. Recovery i cleanup obejmują także stare rekordy oraz obecne niezacommitowane archiwum.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Test instrukcji/schematu i zgodności linii Batch, bez dublowania testów prostych delegacji.
2. Integracja out-of-order, częściowe błędy, duplikaty custom_id i powtórne dostarczenie.
3. Awarie po upload, przed/po create, odbiór starszych wejść.
4. Regresje atomowego budżetu grup i archiwum, kontroli dostępu, cleanup.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E03-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E03-AC02 | Próby 1, 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E03-AC03 | Próby 2, 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E03-AC04 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E03-AC05 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

Przed zmianą applyMatchingLine ponownie sprawdzić bieżące prace nad archiwum Batch. Lokalny wariant kryteriów AC-B1/AC-G4–G7 zostanie dopisany w etapie 6; w tym etapie nie zmieniają znaczenia.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.
