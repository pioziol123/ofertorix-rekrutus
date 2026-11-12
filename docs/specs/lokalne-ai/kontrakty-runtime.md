# Kontrakty wykonania lokalnego agenta

Projekt techniczny, 2026-11-05. Realizuje zatwierdzone LA-07–LA-21 i PZ-01–PZ-08. Jest wspólną częścią SD etapów 7/8 oraz panelu, nie opisem gotowego kodu. Przy sprzeczności ze starszymi propozycjami SD obowiązuje ten kontrakt; wymagania produktu pozostają nadrzędne. Beads: `oferty-pracy-334.16`.

## Granice i identyfikatory

| Właściciel | Odpowiedzialność |
| --- | --- |
| Moduł firm | Cel researchu, reuse/refresh, walidacja, wersja aktualnego raportu i publikacja. |
| Moduł operacji | Polecenia użytkownika, wykonania, kolejka, globalny slot, historia i blokada publikacji. |
| Adapter OpenCode | HTTP, sesja, wiadomości, obserwacja, abort, zebranie wyniku i accounting. Bez reguł oceny firmy. |
| Most przeglądarkowy | Powiązanie wykonania z Chrome, dozwolone narzędzia, zapis obserwacji i interwencja. Nie prowadzi rozmowy z modelem. |
| OpenCode | Rozmowa, wybór narzędzi i synteza z Ollamą `gpt-oss:20b`. |

`operationId` to istniejący UUID researchu. Nowy `executionId: UUID` identyfikuje jedno wykonanie; jawne retry tworzy kolejny. `attemptId: UUID` wskazuje osobny zapis kosztów, nie sesję. `commandId: UUID` deduplikuje polecenie użytkownika. `sessionId: string` jest nieprzezroczystym identyfikatorem OpenCode. Nie przekształcać go w UUID. Nowe wykonanie researchu ma własną sesję i profil Chrome; wykonanie direct profilu/oceny nie ma tych zasobów.

Istniejące `company_research` i jego indeks jednej oczekującej operacji na firmę nie są globalną kolejką agentów. Wykonania dodajemy pod operacją, zamiast tworzyć drugą aktywną operację tej samej firmy. UI grupuje ich historię. UUID operacji/wykonania nie może pochodzić z argumentu modelu.

## Model trwałego stanu

Poniższe nazwy tabel są docelowym projektem do dopasowania do aktualnych migracji; znaczenie i ograniczenia są kontraktem.

| Rekord | Wymagane dane i ograniczenia |
| --- | --- |
| Operacja domenowa | Dla nowej ścieżki: `current_execution_id UUID NULL` i `current_publication_token UUID NULL`, aktualizowane atomowo przy pierwszym wykonaniu/retry. Dla legacy oba null, dotychczasowa ścieżka bez przepisywania historii. Bieżący stan operacji mapuje się z aktywnego wykonania, nigdy ze spóźnionego wyniku poprzedniego. |
| `ai_executions` | `id UUID PK`, typ i ID zadania, `supersedes UUID NULL`, `configuration JSONB`, `disposition`, `publication_allowed boolean`, `publication_token UUID`, `revision bigint`, `created_at`, `finished_at NULL`. Nowe retry: nowy rekord i token, poprzedni pozostaje. |
| `ai_agent_sessions` | `execution_id UUID PK/FK`, `session_id text UNIQUE NULL`, `creation_key UUID UNIQUE`, `runtime_version text NULL`, `directory text`, `runtime_state`, `observed_at NULL`, `stop_confirmed_at NULL`, `error_code NULL`. Wersję uzupełnia health przed create; bez niej nie startujemy. Przed create session_id=null. |
| `ai_local_queue` | `execution_id UUID UNIQUE/FK`, rosnący `queue_sequence bigint UNIQUE`, stan `queued/claimed/finished`, daty. Wybór FIFO po sequence, bez polegania na timestamp. |
| `ai_local_slots` | Dokładnie jeden wiersz `id='local-ai'`, `execution_id UUID NULL/FK`, `generation bigint`, `lease_owner UUID NULL`, `lease_until NULL`. Tylko ten wiersz uprawnia do lokalnej pracy AI w instalacji; obejmuje direct Ollama i OpenCode. OpenAI jest poza tym slotem. |
| `ai_execution_commands` | `command_id UUID PK`, kanoniczny payload i fingerprint, `execution_id`, `action`, `expected_revision`, stan `accepted/applied/failed/unknown`, wynik i daty. Polecenie i intencję zapisujemy w tej samej transakcji. |
| `ai_runtime_requests` | Wykonanie, lokalny UUID żądania, rodzaj `generate/create/start/resume/abort`, fingerprint, `remote_message_id NULL`, stan i odpowiedź. Unikalność lokalnego żądania chroni przed ponownym efektem po duplikacie dostarczenia. |

`runtime_state` jest obserwacją aplikacji, nie kopią enumów dostawcy: `not_started/creating/ready/running/waiting_user/cancelling/stopped/finished/unknown`. `finished` znaczy, że runtime zakończył pracę; sukces raportu określa oddzielnie walidacja. `disposition=active/cancel_requested/cancelled/skipped/superseded` wyraża intencję, nie faktyczną zajętość. Nie ustawiać stopped na podstawie cancelled/skipped.

Nie zastępujemy stanów wszystkich starych tabel wspólnym enumem. Odczyt panelu mapuje stare i nowe rekordy. Migracje addytywne, stare migawki i OpenAI Batch pozostają czytelne. `ai_attempts` zachowuje rolę dziennika kosztów.

## Kolejka i globalny slot

1. Przy przyjęciu zapisz wykonanie, niezmienną konfigurację i pozycję kolejki; dostarczenie pg-boss jest sygnałem do obsługi trwałego stanu.
2. W krótkiej transakcji zablokuj wiersz slotu, następnie najstarszą dopuszczalną pozycję. Jeśli slot jest zajęty, nie uruchamiaj niczego. Jeśli wolny, przypisz execution ID, zwiększ generation, zapisz claimed i właściciela lease. Przy błędzie DB nie wykonuj HTTP.
3. Po commit uruchom direct Ollama dla profilu/pojedynczej oceny albo przygotuj środowisko przeglądarki i sesję OpenCode dla researchu. Każde mutujące działanie workera sprawdza aktualnego właściciela i generation. Stary worker po utracie lease nie rozpoczyna nowych żądań. Nie przetrzymuj transakcji SQL podczas HTTP ani pracy modelu.
4. Lease można przejąć dla obserwacji tego samego wykonania. Wygaśnięcie lease nie czyści execution ID. Przejmujący najpierw rekoncyliuje zapisane żądania i sesję. Dwa workery nie mogą równocześnie inicjować create/start/resume; wysłane niepewne żądanie pozostaje w dzienniku, a generation nie cofa jego efektu u dostawcy.
5. Zwolnij slot dopiero po pozytywnym potwierdzeniu końca pracy runtime: dla direct Ollama po odebraniu pełnej zakończonej odpowiedzi albo potwierdzonym końcu żądania według procedury operatora; dla OpenCode po końcu sesji, zamknięciu lub rozstrzygnięciu wywołań mostu oraz zakończeniu kontekstu Chrome danego wykonania. Zapisz dowód zakończenia i zwolnienie w jednej krótkiej transakcji. Publikacja wyniku może nastąpić później, z własną blokadą.

`waiting_user`, `cancelling`, `unknown` i superseded przy nadal działającym runtime zajmują slot. Retry może być już queued, lecz nie startuje. Stop/skip przed claim usuwa pozycję z oczekiwania bez uruchomienia modelu. Bez priorytetów, zmiany kolejności i limitów długości zadania. Bezpośredni profil i każda pojedyncza ocena Ollamy zajmują ten sam slot; OpenAI pozostaje poza nim.

Samo 204 start, 200 abort, cisza SSE, brak klucza w mapie statusów albo health serwera nie potwierdza zakończenia konkretnego wykonania. Techniczna bramka T02 niżej określa kombinację statusu, wiadomości i zakończonych narzędzi dla przypiętej wersji. Niepewność blokuje kolejkę; panel wskazuje blokujące wykonanie. Nie oferujemy „zwolnij mimo niepewności”. Aplikacja nie naprawia infrastruktury: nie restartuje usług ani nie rekonfiguruje sieci. Operator może według instrukcji ręcznie zakończyć dedykowane OpenCode/most/Chrome, a przy niepewnym direct żądaniu ręcznie zrestartować Ollamę. Procedura musi ustalić koniec starego procesu/żądania i zapisać rozstrzygnięcie wykonania; samo zdrowe API po restarcie nie wystarcza. Ręczny restart Ollamy przerywa również pracę innych korzystających z niej narzędzi. Spóźniony wynik nadal nie uzyskuje prawa publikacji.

## Adapter HTTP OpenCode

```ts
type SessionRef = { executionId: string; sessionId: string; directory: string }
type RuntimeObservation = {
  state: 'ready' | 'running' | 'waiting_user' | 'cancelling' |
    'stopped' | 'finished' | 'unknown'
  observedAt: string
  errorCode: string | null
  stopConfirmedAt: string | null
}
```

Adapter oferuje `create`, `start`, `inspect`, `requestAbort`, `resume`, `collect`. Mutacje przyjmują trwałe request ID; `inspect/collect` wyłącznie odczytują. Wartości powyżej są kontraktem aplikacji. Dokładne body/enumy odczytać z `/doc` przypiętej wersji, nie z pamięci ani samych przykładów SDK.

| Operacja adaptera | Mapowanie HTTP |
| --- | --- |
| Health/wersja | `GET /global/health`. |
| Utworzenie | `POST /session` z korelacją creation key w tytule; odzyskanie przez `GET /session` i weryfikację katalogu/korelacji. |
| Start | `POST /session/:id/prompt_async`; utrwalone message ID, jawny model i dedykowany agent. |
| Inspekcja/wynik | `GET /session/:id`, `/session/status`, `/session/:id/message` i konkretna wiadomość. SSE tylko przyspiesza obserwację. |
| Przerwanie | `POST /session/:id/abort`, potem inspekcja. |
| Wznowienie | Rozwiązanie konkretnej oczekującej interwencji w moście; jeśli kontynuacja wymaga nowej wiadomości OpenCode, osobny zapis resume/message ID i rekoncyliacja jak dla start. |

API sesji, async prompt i abort opisuje [oficjalna dokumentacja serwera](https://opencode.ai/docs/server/). To potwierdza dostępność operacji, nie gwarancję exactly-once. [Generowane typy v1.19.5](https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/gen/types.gen.ts) wskazują directory w kontekście żądań i opcjonalne messageID; są punktem odniesienia, nie zatwierdzeniem tej wersji do wdrożenia.

Sekwencja create: zapisz creating i creation key → POST → zapisz session ID → start. Przy utracie odpowiedzi wyszukaj dokładną korelację w pełnej liście sesji danego katalogu, uwzględniając paginację przypiętej wersji. Jednoznaczny jeden wynik można przypiąć; zero, wiele lub niepełna lista daje unknown. Nie powtarzaj create na podstawie samej nieobecności wyniku.

Przed start zapisz message ID w formacie wymaganym przez runtime i fingerprint wejścia. Po utracie odpowiedzi sprawdź tę wiadomość i jej odpowiedzi w tej sesji. Nie zakładaj, że ponowny POST z tym samym ID jest idempotentny; T01 musi to zbadać. Brak rozstrzygnięcia daje unknown, bez ponownego startu. Tak samo traktuj resume. Po przyjętym 204 obserwuj, nie wysyłaj promptu drugi raz.

Końcowy wynik to końcowa odpowiedź assistant powiązana z zapisanym start/resume, po potwierdzeniu końca pracy. Odrzuć reasoning, komunikaty narzędzi, częściowe fragmenty i przypadkowy ostatni JSON z historii. W pierwszej implementacji końcowy tekst ma zawierać jeden JSON `researchDraft`; bez pętli naprawczej w aplikacji. Błędny format kończy wykonanie błędem, zachowując materiał. `validateResearch` w module firm sprawdza dowody i warunki raportu przed publikacją. Nie włączamy po cichu automatycznych prób naprawczych ze schema mode runtime.

## Chrome i most MCP

OpenCode pozostaje stałą osobną usługą, z trwałym katalogiem danych, własną konfiguracją, bez kont i pluginów właściciela. Dla wykonania aplikacja przygotowuje pusty katalog roboczy i kontekst konfiguracji z dedykowanym MCP. Wszystkie wywołania sesji i MCP mają ten sam zaufany directory. Przed startem sprawdzamy izolację kontekstów w T03. Nie przekazujemy directory z UI ani promptu.

W kontekście wykonania rejestrujemy lokalny most MCP z niezmiennym execution ID i krótkotrwałym poświadczeniem technicznym. Most uruchamia przypięty `chrome-devtools-mcp` przez stdio, łącząc go prywatnym CDP z headless Chrome w dedykowanym kontenerze. Chrome ma jawny profil user-data-dir per wykonanie. Użytkownik obsługuje interwencję przez uwierzytelniony gotowy DevTools z podglądem tej samej karty. Mechanizm sieci i kanału sterowania określa [kwalifikacja](kwalifikacja-runtime.md). Nie używać automatycznego przyłączania do osobistego Chrome. Profil musi przetrwać interwencję i wznowienie tego samego wykonania. Po potwierdzonym końcu i trwałym zapisie materiałów można usunąć profil roboczy z cookies/cache; sprzątanie nie może usunąć archiwum, danych sesji OpenCode ani profilu aktywnego wykonania. Przy końcu zwolnić procesy i odłączyć kontekst, pozostawiając historię/sesje i materiały. Mechanizm disposal i zamknięcie Chrome zweryfikować w T03.

Chrome DevTools MCP faktycznie wykonuje operacje przeglądarkowe. Nasz most przekazuje wybrane narzędzia i zapisuje wyniki; nie implementuje ponownie automatyzacji Chrome. Sam zapis transkryptu po zakończeniu nie wystarcza do nadawania wiarygodnych ID dowodom.

Most filtruje `tools/list` i sprawdza `tools/call`; nie polega tylko na ukryciu narzędzi w konfiguracji agenta. Początkowy zestaw to nawigacja/karty, click, fill, press_key, wait_for i take_snapshot. Szczegółowe schematy bierze z przypiętej wersji. Nie udostępnia uploadu, dowolnego evaluate_script, konsoli/sieci/performance, rozszerzeń, WebMCP ani argumentów filePath. Zrzuty wykonuje sam przy wymaganych zdarzeniach, nie daje modelowi zapisu do dowolnej ścieżki. Nie dopisuje sekretów do wyników. Pozostałe wbudowane narzędzia OpenCode, delegacja i pytania interaktywne są wyłączone. Dodatkowe narzędzie interwencji opisano niżej.

Każdy proces mostu ma wykonanie przypięte przy uruchomieniu, nie pobiera „aktualnego execution ID” przy każdym wywołaniu. Sprawdza też slot/generation i prawo do używania narzędzi. Unieważnienie kontekstu blokuje nowe wywołania; kończące się stare odpowiedzi trafiają tylko do starego wykonania. Zmiana slotu nie przekierowuje starego narzędzia do nowego Chrome. Techniczny kanał zapisu archiwum do aplikacji jest uwierzytelniony i nie jest narzędziem WWW agenta.

[Konfiguracja Chrome MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md) opisuje własny profil, tryb widoczny i połączenie z przeglądarką; [referencja narzędzi](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) opisuje snapshot oparty na drzewie dostępności i zrzuty. Snapshot jest odczytanym fragmentem, nie gwarancją pełnego tekstu strony. Brak treści/częściowy odczyt jest jawny. [Konfiguracja MCP OpenCode](https://opencode.ai/docs/mcp-servers/) wspiera lokalny proces z environment. Statystyki i CrUX wyłączamy według [README Chrome MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), wersję przypinamy.

Weryfikacja sieci jest oddzielna od filtrowania narzędzi. Proces Chrome dostaje kontrolowany egress: publiczny HTTP(S), bez prywatnych/lokalnych adresów również po DNS, przekierowaniach, iframe i w zasobach dodatkowych. Proxy bez ochrony przed obejściem nie spełnia LA-09. Dozwolone połączenia administracyjne OpenCode/Ollama/mostu nie otwierają tych adresów dla odwiedzanych stron. Wybrano kontener headless Chrome z egzekwowaniem egress przez nftables i kontrolowane proxy według kwalifikacji; test na docelowym Docker/macOS jest bramką T04; sam prompt lub lista URL jej nie zastępuje.

## Archiwum i dowody

Każde wywołanie ma trwały identyfikator w obrębie wykonania oraz fingerprint nazwy i argumentów. Zapis intencji przed akcją, zapis odpowiedzi przed przekazaniem do OpenCode. Awaria zapisu odpowiedzi nie pozwala podać jej modelowi jako wiarygodnego dowodu. Niepewnych akcji nie odtwarzamy ślepo. Powtórzone ukończone wywołanie zwraca zachowany wynik; ten sam ID z innym payload daje konflikt.

Archiwum: execution ID, session ID, tool call ID, typ artefaktu, czas, SHA-256 i treść/identyfikator trwałego obiektu. Dowód dodatkowo ma nieujemny lokalny integer ID, URL, tytuł, accessedAt, `kind=search_snippet/page`, `readStatus=complete/partial` i dokładny tekst zwrócony modelowi. ID nadaje magazyn atomowo, nie model. Unikalność `(execution_id, evidence_id)` i niezmienność zapisu; retry nie dziedziczy identyfikatorów dowodów poprzedniego wykonania. Wykonawca przekazuje walidatorowi tylko dowody odczytanych publicznych stron tego wykonania (kind=page), odwzorowane na istniejący `ResearchEvidence`; snippet pozostaje wyłącznie materiałem archiwalnym/nawigacyjnym. Publikacja odrzuca twierdzenie oparte wyłącznie na snippet nawet gdy cytat jest dosłowny.

Sam fragment, adres lub tytuł wyniku Google nie wystarcza do publikacji faktu/opinii i nie daje dowodu page. Search snippet pozostaje fragmentem wyniku Google i zachowuje zarówno URL wyników, jak i wskazanego źródła. Otwarta strona tworzy page dopiero po faktycznym odczycie; cytat musi wystąpić w zapisanym tekście. Nie przypisujemy znalezionego snippetu do treści strony, której nie odczytano. Nie przenosimy OpenAI `citedEvidence(...).slice(0,40)` jako globalnego limitu materiałów agenta.

Rozmowy, zdarzenia, narzędzia, dowody, raporty i diagnostyka mają retencję bezterminową. Nie gwarantujemy odtwarzania utraconych surowych zdarzeń SSE, jeśli runtime nie ma replay: luka ma być jawna, wiadomości odtwarzamy przez API, a narzędzia przez własne archiwum. Nie generujemy fikcyjnych zdarzeń. Profile Chrome są usuwalnym stanem roboczym wymagającym ochrony lokalnej; po końcu i zapisie materiałów można je sprzątnąć, także cookies/cache. Cookies i poświadczeń nie eksportujemy do archiwum raportów. Brak miejsca na dysku jest jawnym błędem infrastruktury, nie powodem cichego kasowania historii.

## Interwencja i polecenia panelu

Blokada jednej strony najpierw skłania agenta do próby pozostałych znalezionych publicznych źródeł. Strony wymagające konta pomijamy, bez oczekiwania na zalogowanie. Gdy publiczna praca jest dalej zablokowana (np. CAPTCHA Google), most wystawia `request_intervention({reason, pageId})` z zamkniętym reason: `consent/captcha/access_block/other`. Nie jest to narzędzie pytań OpenCode ani zgoda na nowe uprawnienia. Zapisuje intervention ID i screenshot lub jawny błąd zrzutu. Wywołanie oczekuje na rozwiązanie przez panel; nie uruchamia kolejnych odczytów. Sesja i slot pozostają zajęte, bez automatycznego deadline. Tekst strony nie może sam zatwierdzić interwencji.

| Akcja | Trwały skutek | Działanie poza transakcją |
| --- | --- | --- |
| check | Polecenie sprawdzenia i ostatnia obserwacja z datą. | Inspekcja istniejącego wykonania, bez create/start. Direct Ollama bez ID nie ma zdalnej inspekcji: pokazać tę zdolność jako niedostępną. |
| stop | Odebranie publikacji; cancel_requested albo cancelled przed startem. | Abort konkretnej sesji, następnie potwierdzenie stanu. |
| skip | Odebranie publikacji, skipped; reszta grupy może logicznie postępować. | Próba abort. Zajęty slot agenta pozostaje do potwierdzonego końca. |
| retry | W tej samej transakcji stare publication_allowed=false i disposition=superseded, nowe wykonanie/token/supersedes oraz queued z kopią dotychczasowego wejścia, konfiguracji, wersji instrukcji i schematu, bez odczytu nowej konfiguracji `.env` lub nowego profilu. | Próba abort starego. Nowe lokalne wykonanie czeka na wolny slot. |
| resume | Przy waiting_user zapisz rozwiązanie konkretnego intervention ID i polecenie; nie zmieniaj execution/session ID. | Rozwiąż istniejące oczekujące narzędzie, a nie nowy start. Przed kontynuacją potwierdź dostępność dotychczasowego Chrome. |

Projekt endpointów w istniejącym API: `GET /api/ai/tasks`, `GET /api/ai/tasks/:id`, `POST /api/ai/tasks/:id/commands`, `GET /api/ai/commands/:commandId`. ID w panelu wskazuje zadanie/zakres, payload jednoznacznie wskazuje także execution ID. POST: `{commandId, executionId, expectedRevision, action, scope:'item'|'group', interventionId?}`. interventionId wymagany tylko dla resume. Akcja group rozwija się do zapisanej listy wykonawczych poleceń dla członków. Resume dotyczy konkretnego wykonania z interwencją, nie całej grupy. Bez akcji na zleceniu nadrzędnym.

POST zwraca 202 z ID polecenia i zapisaną intencją; nie twierdzi, że runtime wykonał akcję. Identyczny commandId/payload zwraca istniejący rezultat. Zmieniony payload albo nieaktualna revision: 409 bez skutku; nieprawidłowy zakres/akcja/interwencja: 422. Sprawdzenie duplikatu jest przed sprawdzeniem revision, aby powtórzona odpowiedź nie zmieniała sukcesu w konflikt. Wszystko pod obecną autoryzacją prywatnej aplikacji. GET szczegółów pokazuje disposition, runtimeState, observedAt, zdolności adaptera, kolejkę/blokujący execution ID, interwencję, historię i późne odpowiedzi bez publikacji.

W transakcji publikacji blokuj najpierw operację, potem wykonanie w tej samej kolejności co komendy. Publikuj tylko gdy wskazuje je aktualny token operacji, publication_allowed=true i disposition=active. Utrwal wynik i zmianę aktualnego raportu atomowo. Jeśli publikacja wygrała wcześniej, stop/skip jej nie wycofuje. Jeśli wygrało retry/stop/skip, zachowaj wynik z powodem braku publikacji. Sama późna odpowiedź starego wykonania nie aktualizuje nowego tokenu.

## Bramki techniczne i przekazanie

Poniższe to praca weryfikacyjna wykonawcy, nie ponowne pytania produktowe ani benchmark modelu. Oficjalne źródła sprawdzono 2026-11-05; usług lokalnych i scenariuszy live nie uruchomiono w ramach tej specyfikacji.

| Bramka | Wymagany dowód | Blokowany zakres |
| --- | --- | --- |
| T01 | Przypięte wersje i `/doc`; create/list korelacja, format wiadomości, utrata odpowiedzi start/resume, obsługa duplikatu message ID. Niejednoznaczność musi dawać unknown. | Włączenie agenta live; atrapy i wcześniejsze refaktory mogą powstawać. |
| T02 | Wiarygodne rozpoznanie końca i przerwania direct Ollama oraz sesji/narzędzi OpenCode; wspólny slot dla obu ścieżek, restart workera i ręczna procedura operatora; brak automatycznych restartów usług. | Zwalnianie slotu i automatyczny start następnego agenta live. |
| T03 | Izolacja konfiguracji/MCP przez directory; niezmienny kontekst execution ID, nowy czysty Chrome, wznowienie tego samego, zakończenie procesów bez usunięcia historii. | Narzędzia przeglądarkowe live. |
| T04 | Test całego ruchu Chrome na docelowym środowisku: DNS/IPv6/redirect/iframe/subresource/WebSocket i próby obejścia egress. | Publiczny research z niezaufanymi stronami. |
| T05 | Dowody archiwizowane przed zwróceniem do modelu, cytaty z właściwego wykonania, luka SSE jawna, snapshot częściowy, screenshot i interwencja, duplikat resume. | Publikacja raportu i odbiór LA-12/13/15. |

Wyniki zapisać w Beads odpowiednich etapów i krótkim raporcie wersji/scenariuszy. Nie oznaczać passed na podstawie dokumentacji. Po błędzie naprawić integrację lub opisać konkretną rozbieżność; zmiana zatwierdzonych reguł wymaga rozmowy z właścicielem. Plan realizacji i sposób wejścia lokalnego modelu: [przekazanie](przekazanie-lokalnemu-modelowi.md).

## Uzupełnienie po grill-me: profil, oceny i zasady zakończenia

Wspólna kolejka/slot powstaje już w etapie 5 dla direct profilu, w etapie 6 dołączają pojedyncze oceny, a w etapie 8 OpenCode. Nie tworzyć drugiego slotu ani odrębnego limitera agenta. Grupa do 20 to do 20 jednostek kolejki, nie jeden prompt ani prawo do 20 równoległych generacji. Istniejąca blokada per operacja/pozycja uzupełnia globalny slot, nie zastępuje go. Przekazanie grupy do kolejki zachowuje kolejność wejściową; bez dodatkowego priorytetu. Wstrzymana interwencja blokuje w obecnym wydaniu także profil i oceny.

Direct generate zapisuje intencję przed HTTP, wynik przed publikacją. Surową odpowiedź direct, także odrzuconą przez walidator, zachować jako artefakt execution ID dostępny w historii; nie opierać wglądu jedynie na końcowej propozycji/ocenie. Po niepewnym wysłaniu nie powtarza żądania; lokalny koszt API nadal zero, runtime_state=unknown zajmuje slot. Nie mapować direct na sesję OpenCode ani nie wymyślać session ID. Nowe retry można zapisać przy unknown, lecz czeka ono na potwierdzone zwolnienie wspólnego slotu.

Po błędnym JSON, cytatach, schemacie lub raporcie lokalne wykonanie kończy się błędem i zachowuje surową odpowiedź. Nie uruchamiać nowej generacji automatycznie, także jako naprawy formatu. Bezpieczne odczyty stanu/istniejących wyników można powtarzać bez tworzenia inferencji. Retry kopiuje starą migawkę, a nowe dane wymagają nowego zlecenia; walidacja aktualności nadal nie pozwala starej ocenie wyprzeć oceny nowszego wejścia. Błąd walidacji nie dowodzi zajętości modelu: po odebranym pełnym końcu inferencji można zwolnić slot i wykonywać inne zadania.

Instrukcja researchu obejmuje dotychczasowe kategorie. Każdą należy spróbować sprawdzić i opisać ustaleniem z odczytanej strony lub jawną niewiadomą; brak informacji nie wymusza nieskończonego szukania. Nie wprowadzamy limitu rund/tokenów/czasu. Brak podstaw do poprawnego raportu kończy się jawnym brakiem danych, bez zastąpienia starego raportu. Publiczne narzędzia otrzymują wyłącznie nazwę firmy, domenę, kraj, stanowisko i technologie z ogłoszenia; nie przekazywać im profilu zawodowego, doświadczenia, preferencji ani historii zatrudnienia właściciela. Zbudować wejście narzędzi z dozwolonych danych, nie ograniczać się do instrukcji w promptcie.

Weryfikacja: mieszane zlecenia direct/agent w dwóch workerach nigdy nie generują równolegle; unknown direct blokuje także research, a waiting_user research blokuje direct. Retry po zmianie `.env` i profilu zachowuje identyczną migawkę; błędny wynik nie wywołuje automatycznie modelu drugi raz. Snippet nie przechodzi jako źródło twierdzenia. Usunięcie roboczego profilu Chrome po końcu zachowuje wszystkie trwałe materiały, a aktywne/interwencyjne profile nie są sprzątane.

Jedno wspólne wdrożenie epiku obejmuje panel i te reguły. Logowanie do serwisów i parkowanie sesji ze zwolnieniem zasobów w celu wykonania kolejnego zadania są poza zakresem; przyszłe zadanie `oferty-pracy-281` zależy od odbioru tego wydania. Nie implementować parkowania ani logowania jako części obecnego resume.

## Doprecyzowanie wspólnego zapisu po przeglądzie — 2026-11-05

Ta sekcja rozstrzyga techniczne szczegóły pozostałe w starszych szkicach. Implementacja wspólnej kolejki i komend należy do etapu 5, dopasowanie integruje ją w 6, sesje/most w 7/8, panel dodaje transport HTTP i UI. Nie tworzyć wspólnego dużego modułu posiadającego walidatory domen.

### Powiązania, wersje i blokady

Jedno wykonanie profilu/pojedynczej oceny/researchu ma jeden ai_attempts z `execution_id UUID UNIQUE NULL` FK. Jedna operacja może mieć wiele wykonań; historyczne próby bez execution_id pozostają poprawne. Grupa ani parent komendy ocen nie mają wykonania modelu. Pola current_execution_id i current_publication_token powstają na odpowiednim rekordzie domenowym (import/request/research). ai_executions przechowuje dodatkowo immutable `input_snapshot JSONB`, `instructions text`, `output_schema JSONB`, `prompt_version`, `schema_version`, `result_status NULL|completed|failed`, `error_code NULL`, `runtime_state`, `runtime_observed_at NULL`. Stan sesji jest obserwacją szczegółową, nie konkurencyjnym właścicielem prawa publikacji. Zmiana obserwacji, disposition, bieżącego wykonania i uprawnień zwiększa revision w tej samej transakcji.

Runtime/disposition są oddzielone od wyniku walidacji i kosztu. Kolejka może być finished po nieudanej walidacji, jeśli koniec inferencji potwierdzono. Slot może być zajęty po superseded/skipped. `finished_at` wykonania nie może udawać potwierdzonego końca runtime; osobny stop_confirmed_at/artefakt dowodu. Brak archiwizacji pełnej odpowiedzi blokuje publikację. Dowód końca i surowy wynik należy zapisać trwale; niedostępność magazynu nie uprawnia do utraty materiałów lub nowej generacji.

Stała kolejność blokad: komenda grupowa najpierw group, następnie wszystkie operacje w kolejności `(task_type,operation_id)`, następnie ich wykonania; pojedyncza komenda/publikacja najpierw operacja, następnie wykonanie. Krótkie transakcje slotu nie obejmują blokad domenowych ani HTTP; aktualizacje wymagające obu faz zapisują trwałą intencję i kończą fazy osobno. Dispatcher blokuje slot, wybiera FIFO, sprawdza eligibility; jeżeli po claimie komenda odbierze publikację/zezwolenie na start, worker sprawdza ponownie przed HTTP i kończy bez nowej inferencji. Nie stosować przeciwnej kolejności blokad w recovery.

Wiersz slotu istnieje od migracji. `generation` i request journal zapobiegają nowym działaniom starego workera, ale nie cofają już wysłanego HTTP. Przy utracie lease wynik tego samego request może zostać zarchiwizowany jako obserwacja; zmiany aktualnego wyniku zawsze sprawdzają token i bieżące wykonanie. Brak nowego lease nigdy nie oznacza wolnego slotu. Do prób wyścigów użyć dwóch niezależnych połączeń PG i barier, nie tylko sekwencyjnych wywołań.

### Komendy item/group i historia legacy

Kontrakt POST `/api/ai/tasks/:id/commands` ma dwa strict warianty, które zastępują wcześniejsze wspólne wymaganie executionId dla grupy:

- item: `{commandId:UUID,scope:'item',executionId:UUID,expectedRevision:nonnegativeInteger,action:'check'|'stop'|'skip'|'retry'|'resume',interventionId?:UUID}`;
- group: `{commandId:UUID,scope:'group',expectedRevision:nonnegativeInteger,action:'check'|'stop'|'skip'|'retry'}`; :id wskazuje group UUID, nie parent komendy. Nie ma jednego executionId grupy. Serwer zamraża listę członków i bieżących execution ID/revision w transakcji.

Dla group expectedRevision dotyczy revision grupy, zwiększanej przy komendach sterowania i zmianie członkostwa, nie przy każdym postępie. W transakcji serwer blokuje grupę i operacje członków w ustalonej kolejności, zapisuje bieżące stany oraz listę faktycznie objętych akcją wykonań. Pozycje zakończone od czasu wyświetlenia UI są pomijane zgodnie z PZ-07, z jawną przyczyną w wyniku komendy. Publikacja pojedynczej pozycji nie potrzebuje blokady grupy ani zmiany jej revision, co eliminuje odwrotną kolejność blokad. expectedRevision item nadal chroni każde wykonanie.

Grupowy command i intencje potomne powstają atomowo; deterministyczne child command ID lub unikalne `(parent_command_id,execution_id,action)` chroni przed drugim skutkiem. Brak członków dopuszczalnych do akcji daje 202 z pustą listą i przyczynami pominięcia. Nie uruchamiać nowego retry ukończonych pozycji przez akcję grupową; osobne retry item po sukcesie pozostaje nową historią bez cofania opublikowanego wyniku. Stop/skip zakończonego item daje zapisany no-op `already_published`, nie cofa publikacji. check na zakończonym item odczytuje wynik. resume wymaga waiting_user i dokładnego interventionId, pozostałe akcje nie przyjmują interventionId. Duplikat sprawdzamy przed revision; ten sam commandId pod innym :id/scope/payload to 409. Brak obiektu to 404, niepoprawny payload/akcja to 422, brak prywatnego dostępu według istniejącej autoryzacji.

ai_execution_commands musi zawierać `target_kind:'item'|'group'`, `target_id UUID`, nullable execution_id dla parent grupy i nullable parent_command_id; nie wymuszać wykonania dla grupy. Wynik ma `{commandId,state,targets:[{executionId,status,reason}]}`. accepted/applied oznacza zapis intencji/zastosowanie działań lokalnych; nie potwierdza fizycznego zatrzymania. Niepewne zdalne działanie ma unknown i historię obserwacji.

Odczyt legacy obejmuje też brak execution ID. W etapie panelu dodać leniwe powiązanie `ai_legacy_execution_links(task_type,operation_id,attempt_id,execution_id)` z unikalnym kluczem tożsamości i FK. Przed pierwszą mutującą komendą pod blokadą domenową tworzymy execution odzwierciedlający istniejącą próbę, bez nowego płatnego HTTP, bez przepisywania historycznej konfiguracji i bez zajmowania slotu lokalnego przez OpenAI. Odtąd wszystkie ścieżki publikacji/recovery tego legacy zadania sprawdzają także ten guard. Odczyt sam nie tworzy nowych rekordów.

Retry legacy rekonstruuje instrukcję i schemat tylko z rozpoznanej, wersjonowanej definicji odpowiadającej zapisanej próbie lub z archiwum payloadu Batch. Brak możliwości odtworzenia nie oznacza użycia aktualnego promptu: capability retry=false, jawny kod `snapshot_unavailable`; użytkownik może utworzyć nowe zlecenie. Dla aktywnego starego płatnego wywołania o nieznanym skutku nie wolno ponownie wysłać go automatycznie. Jawny retry to nowa kosztowa próba wymagająca zwykłej rezerwacji OpenAI; brak środków nie przywraca staremu wykonaniu publikacji. Zdalny abort Batch tylko gdy dokładnie cały zakres partii należy do zaznaczonej grupy; item stop/skip odbiera tylko jego publikację. Stare grupy >20 pozostają odczytywalne z własnym zakresem, nie dzielić ich wstecznie.

### Odczyt panelu i artefakty

`GET /api/ai/tasks` ma filtry type=profile|matching|research, provider, state, groupId oraz limit domyślnie 50, zakres 1–100, cursor keyset `(created_at,id)`, malejąco. Błędny cursor/filtr to 422. Odpowiedź `{items,nextCursor}`. Rekord `{id,type,subject,groupId,parentId,provider,model,disposition,resultStatus,runtimeState,observedAt,error,revision,currentExecutionId,capabilities,queue}`; nullable pola są null, nie zgadywane. queue zawiera sequence i blockingExecutionId lub null; nie obiecywać czasu ukończenia. capabilities to jawne check/stop/skip/retry/resume z allowed i reason. Widok legacy bez execution ma currentExecutionId=null; mutująca komenda najpierw pobiera/przygotowuje guard przez serwerowy endpoint szczegółów komend, nie przez żądanie modelu. Dla spójnego payloadu item dodać `POST /api/ai/tasks/:id/execution-link` — idempotentne uwierzytelnione przygotowanie legacy guard, bez inferencji; zwraca executionId/revision.

Szczegóły dodają historię wykonań/komend, interwencję, późne odpowiedzi i odnośniki artefaktów z paginacją po ID. Oddzielny uwierzytelniony GET `/api/ai/executions/:executionId/artifacts/:artifactId` sprawdza przynależność, nie przyjmuje ścieżki pliku i nie ujawnia sekretów. Tekst/HTML wyświetlać bez wykonywania (escaped/plain text), pliki jako bezpieczne załączniki; obraz screenshot może być renderowany. Trwałe artefakty w repozytoryjnym magazynie/wolumenie, z atomowym zapisem, SHA-256 i metadanymi w PG; nie w usuwalnym profilu Chrome. Dla dostępności po crash zapis obiektu przed transakcją metadanych, kompletność potwierdzić hashem; osierocony plik nie staje się dowodem samym istnieniem.

## Kwalifikacja przed etapami 7/8

[Kwalifikacja runtime](kwalifikacja-runtime.md), zadanie `334.21`, dostarcza manifest przypiętych wersji, dowód kanału headless/interwencji i izolacji sieci. To zależność etapu 7; nie blokuje wcześniejszych refaktorów. Zestaw bazowy: Ollama 0.40.14, OpenCode 1.19.5, chrome-devtools-mcp 1.12.0 i Chrome for Testing 157.0.8103.38. Są wybrane do weryfikacji, nie sprawdzone lokalnie. Na brak pozytywnego wyniku nie włączać publicznego researchu, nie używać latest ani osobistego Chrome jako obejścia.
