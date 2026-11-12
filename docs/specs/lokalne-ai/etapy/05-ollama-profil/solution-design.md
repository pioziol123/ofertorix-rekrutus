# Etap 5: Ollama gpt-oss:20b i lokalny profil — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 5 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.6`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

Zakres normatywny zachowania: [Requirements](requirements.md), E05-R01–E05-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Dodać lib/ai/models/ollama.ts implementujący strukturalny model etapu 2. Wprowadzić wersjonowaną konfigurację w lib/ai/configuration.ts; przełączanie wykonania należy do koordynatora, nie walidatora profilu. Zaktualizować .env.example, Compose, README, gotowość API/UI i recovery profilu. Ollama na hoście jest uzgodnionym kierunkiem uruchomienia; połączenie sprawdzić z kontenera.

## Decyzja E05-D01 — Natywny adapter Ollamy i konfiguracja wersjonowana

**Decyzja techniczna:** Protokół OpenAI-compatible jest alternatywą, lecz natywne API pozwala jawnie obsłużyć zakończenie i telemetrię Ollamy. OpenCode nie jest potrzebny do pojedynczej propozycji profilu.

Punkty integracji w obecnym katalogu: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [worker/index.ts](../../../../../worker/index.ts), [.env.example](../../../../../.env.example). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

Potwierdzono 2026-11-05 osobny wybór modelu i wykonania per zastosowanie; [zakres decyzji](../../requirements.md#doprecyzowanie-potwierdzone-2026-11-05). Konfiguracja serwerowa w `.env` została potwierdzona; dokładne nazwy i strukturę określa kontrakt po przeglądzie poniżej.

## Kontrakty i niezmienniki

Dokładne env i strict schemat wyboru/endpointów opisuje sekcja „Kontrakt konfiguracji po przeglądzie” poniżej. Dopuszczalne kombinacje: profil openai/direct albo ollama/direct; matching openai/batch (ollama/direct od etapu 6); research openai/direct (ollama/agent od etapu 8). Nieobsługiwane kombinacje są odrzucane przed wysłaniem danych.

Migawka zapisana w configuration zawiera dodatkowo promptVersion, schemaVersion, runtimeParameters, endpointRef i identyfikator/digest modelu, gdy dostępny. Jeśli zlecenie ma zapisany digest modelu, worker sprawdza go przed wykonaniem; zmiana modelu pod tym samym tagiem daje jawny błąd zamiast cichego wykonania inną wersją. Gdy digest nie jest dostępny, zapisujemy null i jawny brak takiej gwarancji w metadanych operacji. Endpoint i sekret są rozwiązywane przez serwerowy rejestr; zmiana adresu pod danym endpointRef wymaga nowej wersji tego wpisu. Brak starego wpisu blokuje wykonanie zamiast przekierować zadanie. Stary JSON bez version jest dekodowany jako legacy, bez nadpisywania w bazie. Wariant OpenAI przechowuje dotychczasowe ceny i limity; Ollama nie ma cennika ani pól kwot użycia.

POST /api/chat: messages i format z JSON Schema; stream:false na początek. Adapter normalizuje wynik do ModelResult etapu 2; treść myślenia nie jest raportem. completed wymaga zakończenia i akceptowalnego done_reason; brak pełnego wyniku nie publikuje propozycji. Nie kopiować maxOutputTokens z płatnej konfiguracji do num_predict. Okno fizyczne jest zapisanym parametrem runtime. GET /api/tags służy sprawdzeniu obecności modelu i odczytowi metadanych, nie dowodzi jakości ani zmieszczenia wejścia. Obsługa przepełnienia należy do technicznego kontraktu integracji; nie wykonujemy benchmarków treści. Kontrola JSON i dowodów nadal obowiązuje dla rzeczywistych odpowiedzi.

Ograniczenie SQL attempt BETWEEN 1 AND 2 dotyczy obecnej polityki płatnego profilu. Zachować je; każde ręczne lokalne wykonanie ma nową generation i attempt=1, zgodnie z kontraktem migracji poniżej. Błędny format kończy próbę; brak kwot nie oznacza automatycznego zapętlenia identycznego błędu.

Lokalna próba korzysta z ai_attempts, ale rezerwacja wynosi 0 i nie sprawdza dostępnego płatnego salda. actual_pln=0 po zakończeniu również przy nieznanym usage; usage=null oznacza brak pomiaru. Stan runtime/disposition i lease należą do ai_executions/slotu; indeks profile_one_pending_ai wymaga opisanej poniżej zmiany dla legacy. Przerwanie oznacza brak publikacji; utrata łączności nie dowodzi zatrzymania inferencji na serwerze. Recovery nie uruchamia drugiego HTTP, gdy pierwsze może nadal działać: oznacza wykonanie niepewne, koszt lokalny pozostaje znany zero. Jawne ponowienie zapisuje nową próbę od razu; jej start czeka na potwierdzony koniec poprzedniej.

## Migracja i uruchomienie

Wymagana addytywna migracja wspólnych wykonań/kolejki/slotu oraz powiązań profilu, według kontraktu poniżej, bez zmiany starych konfiguracji. WWW i worker dostają spójną konfigurację. Kolejka nie może automatycznie przerwać lokalnego modelu po obecnych 300 s: lease jest odnawiany, a jego utrata nie uprawnia do nowej inferencji. Włączenie tylko nowych profili po sprawdzeniu dostępności API/modelu; stary OpenAI pozostaje obsługiwany. Uzupełnić D-05 architektury jako rozszerzenie.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Test konfiguracji legacy/v1, pustych env, kombinacji niedozwolonych i braku sekretów w migawce.
2. Testy atrapy Ollamy: normalizacja, done_reason, brak usage, błędny JSON, odmowa/przerwanie i awarie.
3. Integracja PG: lokalny koszt zero przy przekroczonym budżecie, zmiana konfiguracji, równoległy claim, duplikat wyniku i anulowanie.
4. Test API worker→Ollama: GET /api/tags, lista pusta/model obecny/model nieobecny, awaria i błędny format; bez testowych generacji oceniających jakość. Techniczne długie przebiegi i przerwanie sprawdzić na atrapach; jakość wyniku ocenia użytkownik w normalnym użyciu.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E05-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC02 | Próby 2, 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC03 | Próby 1, 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC04 | Próby 3–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC05 | Próby 2–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Gotowość i kontrola zmian

Konfiguracja, done_reason, przepełnienie i recovery są określone w SD po przeglądzie 2026-11-05. O-L1 to techniczny test połączenia/modelu podczas realizacji, nie brak decyzji przed kodowaniem. Niewykonany test live nie jest sukcesem.

Przed kodem odświeżyć stan roboczy i zależności Beads. Przegląd specyfikacji wykonano 2026-11-05; nie zastępuje wyników testów ani kontroli zmian powstałych po przeglądzie.

## Źródła integracji

Zweryfikowano 2026-11-04: [chat API Ollamy](https://docs.ollama.com/api/chat) opisuje format żądania i wynik; [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) opisuje przekazanie JSON Schema. Obsługę na wybranej wersji i modelu potwierdza dopiero pilot.

Aktualizacja 2026-11-05: dostępność sprawdzamy przez [GET /api/tags](https://docs.ollama.com/api/tags); wcześniejszy pilot jakości odpowiedzi został zastąpiony oceną właściciela podczas normalnego używania. Testy techniczne i walidatory pozostają wymagane.

Rozszerzenie z 2026-11-05: ręczne check/stop/skip w [panelu zadań](../../features/panel-zadan/requirements.md). Wspólne komendy i ich wpływ na recovery/publikację określają kontrakty runtime; HTTP/UI dodaje panel.

Wyjątek potwierdzony 2026-11-05: zakaz uruchamiania kolejnego wykonania przy running/unknown dotyczy automatycznego recovery. Jawne ponowienie w panelu jest dozwolone po atomowym odebraniu staremu wykonaniu prawa publikacji; abort jest próbą, późny wynik pozostaje do wglądu. Kanoniczny kontrakt: [panel zadań](../../features/panel-zadan/requirements.md).

## Wspólny slot i ręczne retry — 2026-11-05

Używać `ai_local_queue` i jednego `ai_local_slots` z kontraktów runtime dla wszystkich lokalnych prac, nie tylko OpenCode. Slot przypisany do execution ID, nie dostawy kolejki; zwalniany po potwierdzonym końcu inferencji. Przy niepewnym HTTP nie powtarzać generate i nie uznawać abort połączenia za koniec pracy na serwerze. Operator może według instrukcji ręcznie zrestartować Ollamę; aplikacja nie uruchamia restartu. Potwierdzenie końca i zwolnienie slotu muszą mieć trwały zapis.

Ręczne retry można zapisać przed rozstrzygnięciem unknown, lecz czeka ono na slot. Kopiować poprzednią migawkę, bez aktualnego `.env` lub profilu; poprzedni wynik traci publikację i pozostaje w historii. Generacje naprawcze po złym formacie/cytatach nie uruchamiają się automatycznie. Testy integracyjne obejmują profile i oceny konkurujące z zatrzymanym/nieznanym researchem, zamianę konfiguracji przed retry oraz błąd odpowiedzi bez drugiego HTTP. Budżet OpenAI i stare migawki pozostają zgodne. Zob. LA-11, LA-16–18.

## Kontrakt konfiguracji po przeglądzie — 2026-11-05

Poniższy kontrakt zastępuje wcześniejsze propozycje nazw/pól. Trzy strict JSON env: `AI_PROFILE_EXECUTION_JSON`, `AI_MATCHING_EXECUTION_JSON`, `AI_RESEARCH_EXECUTION_JSON`. Brak (undefined) oznacza legacy *_PRICING_JSON. Pusty string, null, nieznane pola lub błędna kombinacja oznaczają błąd bez fallbacku.

Wariant wyboru v1: `{version:1,provider:'openai'|'ollama',execution:'direct'|'batch'|'agent',model:string,endpointRef:string,endpointVersion:positiveInteger,runtimeParameters:object}`. Dla OpenAI runtimeParameters={} i ceny/limity z właściwego istniejącego *_PRICING_JSON; model obu konfiguracji musi być taki sam. Dla Ollamy direct runtimeParameters zawiera wyłącznie `{numCtx:positiveInteger}`; nie ma maxInputTokens/maxOutputTokens, num_predict ani pól cen. Dla Ollamy agent runtimeParameters zawiera `{numCtx:positiveInteger,runtimeRef:string,runtimeVersion:positiveInteger}`; profil agent i matching agent niedozwolone. Kombinacje etapów pozostają takie jak opisano powyżej, nieobsługiwana jeszcze ścieżka daje jawny błąd.

Nowy `AI_ENDPOINTS_JSON` to strict lista `{ref:string,version:positiveInteger,url:string,credentialEnv:string|null}` z unikalnym (ref,version). URL absolutny HTTP(S), bez hasła/loginu/query/fragmentu; sieć hosta administracyjnego jest zaufaną konfiguracją serwera, nie argumentem UI. `credentialEnv` jest nazwą env, wartość nigdy nie trafia do migawki. Nieobecny wpis albo brak wymaganego sekretu blokuje wykonanie. Stare wersje wpisów zachowujemy do ukończenia ich zleceń. Przy nowym URL tworzymy nową version. Fabryka adaptera nie odczytuje aktualnego wyboru zastosowania zamiast zapisanej migawki.

Migawka v1 dodaje do wyboru: `promptVersion`, `schemaVersion`, dokładne `instructions`, `output:{name,schema}`, niezmienne wejście albo FK do jego wersji, `modelDigest:string|null` oraz `pricing` tylko dla OpenAI (dotychczasowy obiekt AiConfiguration). Wersje instrukcji/schematu identyfikują implementację, zapis treści zabezpiecza retry po aktualizacji kodu. JSON bez version jest dekodowany jako legacy, bez aktualizacji starych wierszy. Nieznana version jest błędem. To format zapisu nowych zleceń, nie żądanie modyfikacji `.env` właściciela w trakcie przygotowania dokumentacji.

Początkowe numCtx musi jawnie podać operator; brak nie zgaduje fizycznych zasobów. Sprawdzamy obecność modelu i digest przez tags przy przygotowaniu oraz przed claimem; retry porównuje stary digest, nie odświeża go. Gdy digest rzeczywiście nie jest udostępniony, null oznacza jawny brak gwarancji wersji modelu, nigdy automatyczny wybór innego modelu. Stały model lokalny: dokładnie gpt-oss:20b.

## Kontrakt natywnego HTTP i fizycznego kontekstu

Wersja bazowa do kwalifikacji: Ollama **0.40.14**; nie jest to twierdzenie o lokalnie zainstalowanej wersji. [Typy przypiętej wersji](https://github.com/ollama/ollama/blob/v0.40.14/api/types.go) definiują truncate i shift; [obsługa żądania](https://github.com/ollama/ollama/blob/v0.40.14/server/routes.go) rozróżnia te opcje. Wybrana integracja wysyła `stream:false`, `truncate:false`, `shift:false`, `options:{num_ctx:numCtx}`, system instructions, user input i `format:output.schema`. Nie wywołuje automatycznej naprawy ani podziału CV. Nie wysyła num_predict; adapter nie polega na domyślnym przycinaniu runtime.

Normalizacja: `done=true`, `done_reason='stop'`, role assistant i niepusty message.content dają completed. `done=true` z length daje incomplete i zakończony runtime; inny/pusty done_reason nie daje sukcesu. message.thinking nie jest treścią. Liczniki prompt_eval_count/eval_count niezależnie safe nonnegative integer lub null, responseId=null (nie wymyślać ID Ollamy). Brak done=true lub urwany/nieczytelny envelope nie potwierdza zakończenia; unknown trzyma slot. Odebrana pełna odpowiedź z done=true dowodzi końca inferencji także gdy JSON w content nie przechodzi walidacji domenowej.

Błąd przepełnienia wejścia/wyjścia oznaczyć `context_overflow`, zachować pełne wejście i brak publikacji. Test techniczny wybranej wersji ma wykazać odmowę za dużego kontekstu przy truncate=false/shift=false, bez cichego skrócenia. Jeżeli wersja ignoruje opcje albo zwraca nieodróżnialny sukces po ucięciu, E05-AC05 nie jest spełnione i ścieżka live pozostaje wyłączona. Nie obchodzić przez szacowanie tokenów z liczby znaków. To test protokołu na danych syntetycznych, nie benchmark jakości modelu.

## Wykonania, migracje i potwierdzanie końca

Etap 5 dostarcza moduł `lib/ai/operations/` (kolejka, slot, dziennik, token publikacji, wspólne komendy domenowe) według [kontraktów runtime](../../kontrakty-runtime.md). Panel później dodaje HTTP/UI, nie implementuje po raz drugi semantyki poleceń. Każda lokalna propozycja ma execution ID i osobny ai_attempts; nie dodawać wykonania nadrzędnego dla kolejki.

Addytywna migracja jest **wymagana**, a nie opcjonalna: tabele ai_executions/local_queue/local_slots/runtime_requests/execution_commands oraz ai_execution_artifacts (surowe odpowiedzi direct), nullable `ai_attempts.execution_id UUID UNIQUE` FK i `profile_imports.current_execution_id/current_publication_token`. Kosztowy rekord lokalny ma reserved_pln=0, actual_pln=0, month=null i state=settled po zakończeniu również przy nieznanym usage; stan runtime trzyma execution, nie dziennik kosztów. Użyć nowej generation per ręczne wykonanie i attempt=1, zachowując istniejące CHECK attempt BETWEEN 1 AND 2 dla płatnego profilu. Nie rozszerzać go do nieograniczonej automatycznej pętli.

Indeks profile_one_pending_ai zachować dla legacy (execution_id IS NULL), nowe lokalne wykonania kontrolować blokadą rekordu importu, aktualnym execution i tokenem; najwyżej jedno bieżące publikowalne wykonanie. Stare superseded+unknown może nadal zajmować slot, choć nowe retry jest już queued. Ręczne retry nie tworzy konfliktu indeksu, bo legacy i execution rozróżniamy jawnie. Sprawdzić ograniczenia i recovery wszystkich konsumentów, nie tylko CREATE TABLE. Nie zmieniać zawartości starych konfiguracji i kosztów.

Przed wysłaniem zapisać request ID i intencję, potem HTTP poza SQL. Niepewne wysłanie nigdy nie jest powtarzane przez recovery. Lease odnawia tylko właściciel; utrata lease nie czyści slotu. Zapis surowej odpowiedzi/telemetrii jest trwały przed publikacją. Stary worker może dostarczyć wynik do archiwum swojego request ID, lecz nie wykona nowego HTTP ani publikacji po utracie uprawnienia.

Dla nierozstrzygniętej inferencji procedura operatora: wstrzymać dispatch nowych prac, odnotować blokujące execution/request i tożsamość procesu/instancji Ollamy, ręcznie zakończyć starą instancję, sprawdzić brak jej procesu oraz zachować potwierdzenie zakończenia i czas. Polecenie administracyjne aplikacji przyjmuje `{executionId,expectedRevision,runtimeInstance,reason,evidence}` i rejestruje rozstrzygnięcie pod blokadą slotu; to nie przycisk „zwolnij mimo niepewności”. Sam nowy health lub pusta lista modeli nie jest dowodem końca. Brak wiarygodnej tożsamości starej instancji blokuje rozstrzygnięcie. Nowa instancja może powstać wyłącznie ręcznie; aplikacja jej nie restartuje. Bez zmiany zasad publikacji spóźnionego wyniku.

Weryfikacja uzupełniająca: test migracji na legacy queued/unknown, dwa workery i trzy typy sztucznych lokalnych zadań, lease wygasły podczas HTTP, crash po wysłaniu/przed zapisem, cancelled/superseded z blokującym slotem, ponad dwie **ręczne** generacje bez zmiany płatnej polityki. Warstwę kolejki można testować z atrapami przyszłych ocen/agenta przed ich implementacją. Test połączenia/tags i kontekstu wykonać z workera; wynik i faktyczną wersję zapisać w Beads. Domyślnie nowa ścieżka pozostaje niewłączona do wspólnego odbioru.

Lokalny adapter rozszerza zestaw bezpiecznych kodów błędu o model_unavailable i context_overflow; nie wyciąga ich z dowolnego komunikatu wyjątku. Niepotwierdzony format odpowiedzi nie dowodzi końca runtime. Ustawienia timeoutów połączenia/odczytu nie mogą ustanawiać stałego deadline całej inferencji; klient HTTP ma obsługiwać długie ciche generacje bez automatycznego ponowienia. Test przekraczający obecne 300 s dostarczenia kolejki wykonać atrapą zegara/serwera, nie benchmarkiem LLM.
