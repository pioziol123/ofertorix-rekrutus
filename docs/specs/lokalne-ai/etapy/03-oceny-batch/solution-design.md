# Etap 3: Oceny oddzielone od OpenAI Batch — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 3 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.4`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

Zakres normatywny zachowania: [Requirements](requirements.md), E03-R01–E03-R05. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Wyodrębnić lib/matching/task.ts dla instrukcji/schematu i neutralnego zadania oraz lib/matching/publication.ts dla walidacji/publikacji. BatchClient i jego archiwum pozostają w adapterze OpenAI; store.ts/groups.ts koordynują istniejący cykl i komendy. Grupa domenowa nie jest tożsama z plikiem lub partią dostawcy.

## Decyzja E03-D01 — Odrębne zadanie oceny i adapter Batch

**Decyzja techniczna:** Przeniesienie całego store do wspólnego AI zgubiłoby reguły domenowe. Emulacja Batch dla przyszłej Ollamy nie jest potrzebna; zachowujemy protokół tylko dla jego rzeczywistego dostawcy.

Punkty integracji w obecnym katalogu: [lib/matching/batch.ts](../../../../../lib/matching/batch.ts), [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/matching/groups.ts](../../../../../lib/matching/groups.ts), [lib/matching/archive.ts](../../../../../lib/matching/archive.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Kontrakty i niezmienniki

MatchingTask ma kontrakt określony w sekcji przeglądu poniżej, ze schematem wywiedzionym z assessmentSchema. Odczyt wersji wejść z matching_requests pozostaje autorytatywny; nie rekonstruować danych z aktualnego profilu podczas odbioru.

Adapter Batch tłumaczy task na obecną linię {custom_id,method:'POST',url:'/v1/responses',body}. Zachować istniejące ograniczenia płatnego Batch, identyfikatory, pliki i kontrolę archiwum. Odebrana linia przechodzi neutralną normalizację wyniku z sekcji przeglądu, obejmującą również charge i errorCode; schema i dowody sprawdza domena.

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

## Gotowość i kontrola zmian

Przejrzano bieżące applyMatchingLine, BatchClient, grupy i archiwum. Lokalny wariant kryteriów AC-B1/AC-G4–G7 powstaje w etapie 6; w tym etapie nie zmieniają znaczenia. Nie ma nierozstrzygniętej decyzji produktowej.

## Przegląd kontraktu — 2026-11-05

Obserwowane: `batchRequest` posiada instrukcje/schemat i płatną kontrolę rozmiaru; `applyMatchingLine` w store.ts łączy normalizację dostawcy, validateAssessment, calculate, publishAiRating i settle. Grupy wywołują tę samą funkcję, ale posiadają własną partię oraz cleanup. Zachować obie ścieżki.

`MatchingTask` jest niezmienną migawką `{requestId,input,promptVersion,schemaVersion,instructions,output:{name,schema}}`; input ma istniejący MatchingInput, wersje niepuste, requestId UUID. Bez konfiguracji transportu i cennika. Batch tłumaczy to na dotychczasowy custom_id i body. Schemat `assessmentSchema` oraz tekst instrukcji pozostają własnością dopasowania. Limity pliku/200 kryteriów/rozmiaru płatnego payloadu pozostają kontrolą Batch, nie przyszłej Ollamy.

Wynik neutralny: `{requestId,outcome:'completed'|'refused'|'incomplete'|'error',text:string|null,usage:{inputTokens:number|null,outputTokens:number|null},responseId:string|null,charge:'metered'|'zero'|'unknown',errorCode:string|null}`. completed zawiera jedną treść do JSON.parse w domenie. Adapter nie zwraca BatchLine ani Batch do publication. `zero` tylko dla potwierdzonej dotychczasowej reguły braku opłaty: batch failed bez plików i brak linii, albo batch_expired. Brak linii w innych okolicznościach oznacza unknown, nigdy domyślne zero. metered oznacza konieczność sprawdzenia usage wobec migawki, a nie samodzielnie wyliczony koszt.

`publishMatchingResult(client,requestId,result)` blokuje matching_requests przez FOR UPDATE i ponownie odczytuje bieżący stan. Dla terminalnego rekordu zwraca zapisany wynik, bez drugiego settle/revision. Pod tą blokadą sprawdza aktualność zapisanych ad_revision_id/profile_version_id według istniejącej reguły publishAiRating, waliduje assessment i zapisuje koszt, historię i stan w jednej transakcji. Jeśli stary wynik nie może być aktualny, pozostaje historią; nie podmieniać wejścia na aktualny profil. Nie utrzymywać SQL podczas HTTP. Fasada applyMatchingLine normalizuje dotychczasowe argumenty i deleguje; nie stanowi drugiego miejsca reguł publikacji.

BatchClient.results nadal odrzuca obce i powtórzone custom_id; nie wybiera dowolnej linii z duplikatu. Archiwum surowe powstaje przed interpretacją i zachowuje dotychczasowe operation ID `group_id ?? request.id`. Stan grupy completed oznacza odebranie wyników, nie sukces wszystkich pozycji; liczniki per pozycja są autorytatywne. Nie dodawać wykonania nadrzędnego grupy ani tabel wykonania w tym refaktorze.

Regresje: `tests/matching-batch.test.ts`, `tests/matching.integration.test.ts`, `tests/matching-groups.integration.test.ts` i istniejące testy archiwum. E03-AC01: zadanie i walidatory; AC02: cykl/archiwum/cleanup; AC03: out-of-order, błędy pozycji i finansowanie; AC04: równoległe powtórzenie wyniku pod blokadą oraz stare wejścia; AC05: utrata odpowiedzi create bez kolejnego POST. Uruchomić check/build i integracje zgodnie z przekazaniem; to plan testów, nie ich wynik.

Przed kodem odświeżyć stan roboczy i zależności Beads. Przegląd specyfikacji wykonano 2026-11-05; nie zastępuje wyników testów ani kontroli zmian powstałych po przeglądzie.

Dla starych oczekujących zleceń autorytatywny jest zapisany request_payload; refaktor nie regeneruje go z aktualnych instrukcji/schematu. MatchingTask nowych zleceń budujemy w domenie, a adapter tłumaczy go do utrwalanego payloadu Batch. Odczyt/cleanup starych artefaktów zachowuje dotychczasowe schematy i identyfikatory. Nie dodawać migracji tylko po to, aby uzyskać nową nazwę typu w bazie.
