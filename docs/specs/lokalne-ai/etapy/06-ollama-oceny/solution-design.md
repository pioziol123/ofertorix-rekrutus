# Etap 6: Lokalne oceny pojedyncze i zbiorcze — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 6 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.7`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

Zakres normatywny zachowania: [Requirements](requirements.md), E06-R01–E06-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Nowy lokalny wykonawca korzysta z MatchingTask/publikacji etapu 3 i adaptera etapu 5. store.ts/groups.ts wybierają trasę z migawki. Worker dostarcza krótkie jednostki obserwacji/claim; trwały postęp jest w PostgreSQL. Rozszerzyć readMatching i komponenty ocen o lokalne stany, bez pól Batch dla lokalnego wykonania.

## Decyzja E06-D01 — Trwały stan każdej lokalnej oceny

**Decyzja techniczna:** Jedno długie wywołanie dla całej grupy utrudnia częściowy sukces i restart. Publikacja pozostaje wspólna z Batch, a wykonanie jest odrębne.

Punkty integracji w obecnym katalogu: [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/matching/groups.ts](../../../../../lib/matching/groups.ts), [lib/matching/model.ts](../../../../../lib/matching/model.ts), [app/components/OfferMatching.vue](../../../../../app/components/OfferMatching.vue). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Kontrakty i niezmienniki

matching_requests zachowuje ad_revision_id/profile_version_id/input i operation ID. Dla lokalnego wykonania request_payload jest null (brak payloadu OpenAI) i nie powstaje matching_batches. Bieżące pole jest już nullable; nie dodawać zbędnej migracji tej kolumny. Do aktywnych stanów dodać running i cancelling, do końcowych cancelled; istniejący unknown obejmuje niepewny skutek wykonania. Każdy nowy stan ma wejść do właściwych częściowych indeksów pending i zapytań recovery.

Przejścia lokalne: queued→running→completed|failed|unknown; queued→cancelled; running→cancelling→cancelled, jeżeli zatrzymanie potwierdzono, w przeciwnym razie unknown. Koszt lokalnej inferencji jest zawsze znany zero, niezależnie od stanu. Lokalne unknown o nierozstrzygniętej aktywności blokuje nową ocenę dla tego samego ogłoszenia do wyjaśnienia, także gdy dotychczasowy indeks pending nie obejmował unknown. Zabezpieczenie musi działać atomowo w komendzie oraz po utracie lease. claim/lease używa warunkowej aktualizacji i tokenu właściciela; publikacja odrzuca stary token i wynik anulowanej operacji. Nie utrzymywać transakcji podczas HTTP.

Grupa przechowuje command_id i członków z jednoznacznym request ID; lokalne wykonanie nie wymaga identyfikatora partii. Stan agregowany wyznacza tabela po przeglądzie poniżej (w szczególności unknown ma pierwszeństwo); oddzielne liczniki completed/failed/cancelled/unknown/excluded nie pozwalają mylić zakończenia z pełnym sukcesem. Przy anulowaniu grupa nie przyjmuje nowych claimów, zachowuje wyniki już opublikowane. unknown wymaga wyjaśnienia przed startem ponowionej pozycji; zapis ręcznego retry może nastąpić wcześniej.

Potwierdzono 2026-11-05 porcjowanie nowych lokalnych ocen: maksymalnie 20 pozycji w grupie. Większa komenda dzieli się automatycznie w kolejności przekazanych ofert: 30 → 20 + 10, 40 → 20 + 20, 41 → 20 + 20 + 1. Nie odrzucać nadmiaru ani nie wysyłać go ponownie przy retry. Pozycje i wyniki nadal są indywidualne; limit rozmiaru grupy nie ustala współbieżności ani kwoty inferencji.

Trwały kontrakt (szczegóły po przeglądzie poniżej): zlecenie nadrzędne z command_id UUID UNIQUE i uporządkowaną listą unikalnych offerIds; grupy mają parent_command_id oraz ordinal z UNIQUE(parent_command_id,ordinal), a członkowie stały request ID. Podział i członkostwo utrwalić atomowo przed enqueue. Powtórzenie command_id z tą samą listą zwraca te same grupy; inna lista pod tym ID daje konflikt. Kolejka przenosi identyfikatory, nie pełną dużą komendę. Listę wyników nadrzędnych i grup prezentować z osobnymi licznikami stanów. Schemat danych i API rozstrzygnięto w uzupełnieniu po przeglądzie poniżej. Istniejących grup i aktywnych partii OpenAI nie przepisywać ani nie dzielić wstecznie.

## Migracja i uruchomienie

Nowe migracje stanów, parent/membership, bieżących tokenów i indeksów aktywności; użyć lease wspólnego modułu z etapu 5; test na starych aktywnych rekordach. Do kanonicznych requirements/SD dopasowania dopisać lokalny wariant AC-B1/AC-G4–G7, nie zmieniając znaczenia dla Batch. Włączyć po lokalnym profilu, najpierw ręcznie kilka ocen i grupę.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Porównać walidację tego samego assessment po normalizacji Batch/Ollama.
2. Integracja grupy: sukces+błąd+excluded, out-of-order, duplikat komendy i wyniku.
3. Restart, utrata lease i race anulowanie/publikacja; stare wyniki nie wypierają aktualnych.
4. Migracja z aktywną partią, read API/UI obu wykonawców, zero budżetu lokalnie, podział komendy 20/21/30/40/41 na grupy do 20, idempotencja podziału.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E06-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC03 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC04 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC05 | Próby 3–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Gotowość i kontrola zmian

API nadrzędnej komendy i stan grupy przy unknown określa uzupełnienie SD z 2026-11-05. Strategia zatrzymania i wspólny slot pochodzą z etapu 5. Nie ma otwartej decyzji produktowej.

Przed kodem odświeżyć stan roboczy i zależności Beads. Przegląd specyfikacji wykonano 2026-11-05; nie zastępuje wyników testów ani kontroli zmian powstałych po przeglądzie.

Rozszerzenie z 2026-11-05: ręczne check/stop/skip w [panelu zadań](../../features/panel-zadan/requirements.md). Wspólne komendy i ich wpływ na recovery/publikację określają kontrakty runtime i uzupełnienie SD poniżej.

Wyjątek potwierdzony 2026-11-05: zakaz uruchamiania kolejnego wykonania przy running/unknown dotyczy automatycznego recovery. Jawne ponowienie w panelu jest dozwolone po atomowym odebraniu staremu wykonaniu prawa publikacji; abort jest próbą, późny wynik pozostaje do wglądu. Kanoniczny kontrakt: [panel zadań](../../features/panel-zadan/requirements.md).

## Wspólny slot i ręczne retry — 2026-11-05

Używać `ai_local_queue` i jednego `ai_local_slots` z kontraktów runtime dla wszystkich lokalnych prac, nie tylko OpenCode. Slot przypisany do execution ID, nie dostawy kolejki; zwalniany po potwierdzonym końcu inferencji. Przy niepewnym HTTP nie powtarzać generate i nie uznawać abort połączenia za koniec pracy na serwerze. Operator może według instrukcji ręcznie zrestartować Ollamę; aplikacja nie uruchamia restartu. Potwierdzenie końca i zwolnienie slotu muszą mieć trwały zapis.

Ręczne retry można zapisać przed rozstrzygnięciem unknown, lecz czeka ono na slot. Kopiować poprzednią migawkę, bez aktualnego `.env` lub profilu; poprzedni wynik traci publikację i pozostaje w historii. Generacje naprawcze po złym formacie/cytatach nie uruchamiają się automatycznie. Testy integracyjne obejmują profile i oceny konkurujące z zatrzymanym/nieznanym researchem, zamianę konfiguracji przed retry oraz błąd odpowiedzi bez drugiego HTTP. Budżet OpenAI i stare migawki pozostają zgodne. Zob. LA-11, LA-16–18.

## Rozstrzygnięte API i stan grupy — przegląd 2026-11-05

Poniższa sekcja zastępuje wcześniejsze propozycje kontraktu nadrzędnego i zdania wymagające rozstrzygnięcia unknown przed zapisaniem ręcznego retry. Zapis retry jest dozwolony od razu; jego **start** wymaga wolnego wspólnego slotu.

Istniejący `POST /api/matching` przyjmuje strict `{commandId:UUID,offerIds:UUID[]}`. Zachować istniejący limit przyjęcia 1–100 i odrzucenie duplikatów/nieprawidłowych ID; to limit pojedynczego komunikatu HTTP, nie limit korzystania z Ollamy. Lokalne grupy dzielić po 20 w kolejności wejściowej, przed odfiltrowaniem excluded/reused. Podział 21/30/40/41 daje odpowiednio 20+1/20+10/20+20/20+20+1. Nowy parent nie ma własnego wykonania modelu ani slotu: wykonania należą wyłącznie do pojedynczych ocen.

W transakcji komendy pod blokadą commandId najpierw szukać ID zarówno w starych matching_groups, jak i nowej tabeli komend, **przed** odczytem bieżącej konfiguracji. Duplikat po zmianie `.env` zwraca stary wynik/trasowanie, nigdy nowe grupy. Dla lokalnego parent fingerprint obejmuje uporządkowane offerIds; inna kolejność jest innym payloadem i daje 409 przy tym samym ID. Dla historycznego Batch zachować dotychczasowe porównanie zbioru. Grupy i kolejkę utrwalić atomowo; błąd zapisu/enqueue cofa całą nową komendę.

Lokalna odpowiedź HTTP 202: `{execution:'direct',commandId,parentId,state,groups:[{groupId,ordinal,state,items:[{requestId,offerId,state,reused}]}],counts}`. UUID parentId oddzielny od commandId, ordinal od 1. Powtórzenie komendy zwraca te same identyfikatory i aktualny widok postępu. Legacy OpenAI zachowuje dotychczasowy status/body; klient rozpoznaje oba warianty. Nowy `GET /api/matching/commands/:parentId` odczytuje ten sam agregat, bez akcji sterujących na parent. Pojedyncze `POST /api/offers/:id/matching` zachowuje swój kontrakt, używa jednego request/execution zamiast fikcyjnej grupy/Batch.

Nowa tabela `matching_commands`: id UUID PK, command_id UUID UNIQUE, fingerprint, ordered_offer_ids UUID[], immutable configuration JSONB, created_at. Nowe matching_groups: nullable parent_command_id FK i ordinal z UNIQUE(parent_command_id,ordinal). command_id istniejącej grupy pozostaje UUID, dla lokalnej podgrupy jest osobnym trwale wygenerowanym ID. Nie używać parent commandId w każdej podgrupie (naruszyłoby UNIQUE). Brak parent dla legacy jest poprawny. Członkostwo i kolejność przechowuje jawna tabela `matching_group_members(group_id,ordinal,request_id,offer_id,reused)` z PK(group_id,ordinal), UNIQUE(group_id,offer_id); istniejące items JSON pozostaje czytelne, nie migrować historii wstecz.

Nowe lokalne requests dodają current_execution_id/current_publication_token. request_payload **już jest nullable** (migracja 1770000000007); lokalnie null i brak matching_batches. ai_attempts.execution_id z etapu 5 wiąże każdą ręczną próbę z jej wykonaniem; request.attempt_id wskazuje bieżącą próbę, starsze zachowujemy przez execution. Indeks aktywnych matching_requests uwzględnia running/cancelling i lokalne unknown dla bieżącego wykonania; jawne retry aktualizuje wykonanie tego samego request zamiast tworzyć drugi request omijający indeks. Nowe zlecenie z nowymi wejściami przy niepewnym bieżącym zadaniu odrzucić z jawnym konfliktem aktywnej pracy; ręczne retry ze starą migawką pozostaje możliwe.

Przy przyjmowaniu grupy zachować istniejące reguły eligible/excluded/reused oraz walidację wersji wejść. reused wskazuje rzeczywisty istniejący request, nie nową generację. Widok pokazuje wspólne wykonanie; akcja grupowa deduplikuje request/execution ID, aby nie wywołać go dwa razy. Nie zmieniać wejścia reused request na aktualny profil.

Agregat jest wyliczany z **bieżących** wykonań członków i stanu blokującego runtime:

| Warunek, w kolejności pierwszeństwa | Stan grupy/parent |
| --- | --- |
| Jakikolwiek członek ma nierozstrzygnięty unknown runtime, również stary superseded trzymający slot | unknown |
| Brak unknown, jest runtime running/cancelling/waiting_user albo rozpoczęte przetwarzanie i oczekujące pozycje | running |
| Są queued, ale żadnego wykonania nie rozpoczęto | queued |
| Brak pracy oczekującej/aktywnej/niepewnej | completed |

completed znaczy rozstrzygnięte pozycje, nie sukces wszystkich. Liczniki osobno completed/failed/cancelled/skipped/unknown/excluded/queued/running; suma obejmuje każdą pozycję dokładnie raz, według jej bieżącej disposition/wyniku. `blockedByExecutionId` wskazuje faktyczny slot, nawet gdy bieżące retry jest queued. Terminalny błąd formatu po pełnym done nie blokuje innych pozycji. unknown pozycji blokuje globalny start również następnej grupy, nie tylko powtórzenie tej samej oferty. Stop/skip grupy odcina publikację nieukończonych członków i nowe claimy; nie usuwa ukończonych wyników.

Uzupełnić podczas implementacji kanoniczne dokumenty dopasowania o lokalny wariant AC-B1/AC-G4–G7 i odczyt obu odpowiedzi HTTP. Regresje: `tests/matching-groups.integration.test.ts`, `tests/matching-ratings.integration.test.ts`, `tests/matching-list.integration.test.ts`, `tests/matching-archive.integration.test.ts`. Testy nowych tras mogą powstać osobno. E06-AC02/03 muszą sprawdzić duplikat po zmianie konfiguracji, kolejność podziału, współbieżny commandId i dwa workery. AC05: unknown na różnych grupach, stop/skip/retry przeciw publikacji; AC06: stare Batch >20 i stare archive operation ID. Bez wymogu live generacji do oceny jakości.

Migracja grup dodaje także `revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)` i `dispatch_allowed boolean NOT NULL DEFAULT true`; komendy grupowe zwiększają revision i stop/skip blokują kolejne claimy nieukończonych pozycji. Odczyt agregatów liczy stan z członków, bez zmiany revision od każdego postępu. Zapis retry grupy i jego dokładna lista celów są atomowe według wspólnego kontraktu; zakończone pozycje nie są ponawiane.

Dla nowych wykonań unknown oznacza nierozstrzygnięty runtime, nie nieodwracalny koniec publikacji. Gdy pełny wynik tego samego request zostanie później potwierdzony, rekoncyliacja może opublikować go tylko pod nadal bieżącym tokenem i disposition=active. Nie traktować samego matching_requests.state=unknown jako powodu odrzucenia poprawnie skorelowanej późnej odpowiedzi. superseded/cancelled/skipped zawsze pozostają bez publikacji; wynik po zakończonej publikacji nie tworzy drugiej rewizji. Reguła idempotencji starego Batch z etapu 3 pozostaje zgodna dla legacy.
