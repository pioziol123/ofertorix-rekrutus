# Etap 8: OpenCode jako agent researchu z gpt-oss:20b — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Beads: `oferty-pracy-334.9`. Wybory produktowe zatwierdzone; sprawność integracji live nie jest potwierdzona. Przed realizacją sprawdzić aktualny kod, zależności i bramki techniczne.

Podstawa: [Requirements](requirements.md), [wymagania przekrojowe](../../requirements.md), [kontrakty runtime](../../kontrakty-runtime.md). E08-R01–E08-R06 pozostają stabilne. Kontrakty runtime są wspólną normatywną częścią tego SD, etapu 7 i panelu; poniżej zakres i integracja etapu.

## Podejście i granice

Dedykowany `opencode serve` jako osobna lokalna usługa. Worker używa adaptera w projektowanym `lib/ai/opencode/`; OpenCode łączy się z Ollamą `gpt-oss:20b` i używa mostu Chrome DevTools MCP z etapu 7. `ResearchExecutor` integruje wynik, a moduł firm waliduje i publikuje raport. Aplikacja nie prowadzi własnej pętli rozmowy/narzędzi. Profil i oceny używają bezpośredniego adaptera modelu.

## Stan bazowy i miejsca integracji

Rozpoznano 2026-11-05: [research.ts](../../../../../lib/companies/research.ts) przechowuje komendy, operacje UUID, próby kosztowe i wynik. `executeCompanyResearch` ma blokadę per operacja; nie ma globalnego slotu OpenCode ani wykonań retry z tokenem publikacji. Recovery zamienia przerwane running na unknown. [worker/index.ts](../../../../../worker/index.ts) obsługuje kolejkę i recovery. [research-model.ts](../../../../../lib/companies/research-model.ts) posiada schemat i validateResearch. Są to zastane pliki robocze, nie wyłącznie HEAD.

`company_research` ma ograniczenia stanów i jednej aktywnej operacji na firmę; nie dopisywać nowych stanów bez addytywnej migracji. Nie tworzyć drugiej operacji firmy w celu ominięcia indeksu: wykonania i supersedes należą pod tę samą operację. `ai_attempts` pozostaje dziennikiem kosztów, session ID przechowujemy osobno.

## E08-D01 — API sesji i trwały dziennik żądań

Wybrane HTTP headless, nie CLI jako docelowy transport. Adapter create/start/inspect/requestAbort/resume/collect realizuje sekcję „Adapter HTTP OpenCode” kontraktów runtime. Zapisujemy creation key i session ID przed promptem; start/resume mają trwałe request ID i message ID. Utracona odpowiedź wymaga inspekcji, bez ślepego ponowienia. Wersję i body sprawdzić z `/doc` wybranego runtime.

SSE jest obserwacją pomocniczą; po zerwaniu połączenia rekoncyliujemy konkretną sesję i wiadomości. Koniec strumienia lub idle nie jest sukcesem raportu. Wymagamy finalnego JSON przypisanego do właściwej wiadomości oraz validateResearch na dowodach tego wykonania. Niepoprawna odpowiedź pozostaje zachowana jako błąd; brak aplikacyjnej pętli automatycznych poprawek.

## E08-D02 — Jeden aktywny agent i trwała kolejka

Ze względu na zasoby komputera potwierdzono wspólną globalną kolejkę FIFO profilu, pojedynczych ocen i researchu. Slot przypisany do execution ID, nie dostawy pg-boss. Wygaśnięcie lease nie zwalnia miejsca. Wznawiany worker przejmuje obserwację tej samej sesji. Unknown, cancelling i interwencja blokują dalsze starty aż do pozytywnego potwierdzenia zakończenia i zamknięcia starego środowiska przeglądarki.

Jawne retry od razu odbiera staremu wykonaniu publikację i zapisuje nowe wykonanie queued; abort to osobne działanie. Nowy agent czeka na zwolnienie slotu. Zastępuje to wcześniejszą propozycję startu bez czekania na abort. Direct Ollama dla profilu/ocen korzysta z tego samego slotu. Nie narzucamy kwot rund/tokenów ani deadline całej sesji.

## E08-D03 — Usługi, izolacja i retencja

Ollama i OpenCode to osobne lokalne usługi, uruchamiane przygotowanymi poleceniami/skryptem; adresy i poświadczenia serwerowe w `.env`. OpenCode ma dedykowane dane/config, bez osobistych repo rules, pluginów i kont. Domyślne uprawnienia deny, dozwolone wyłącznie narzędzia mostu etapu 7. Połączenie API uwierzytelnione, dostępne dla aplikacji/workera, bez bezpośredniego dostępu z UI. Kontekst directory i MCP przypisany do konkretnego wykonania według kontraktów runtime.

Dane sesji, rozmowy, narzędzia, zdarzenia, dowody i raporty zachowujemy bezterminowo, bez sekretów i bez niszczącej rotacji. Wersja procesu może się zmienić bez usunięcia wolumenu danych. Luka SSE pozostaje jawna; nie udajemy replay, jeśli runtime go nie obsługuje. Brak miejsca na dysku daje błąd, nie automatyczne czyszczenie.

## Migracja i uruchomienie

Rekordy wspólnych wykonań/kolejki/slotu/żądań powstają od etapu5; tu dołącza sesja OpenCode i jej powiązanie z istniejącym wspólnym slotem. Publikacja pod tokenem jest opisana raz w kontraktach runtime. Migracje addytywne; zachować stare stany i migawki OpenAI oraz indeksy domenowe. Uzupełnić kanoniczne firmy-research i operacje przed włączeniem nowej ścieżki. Nie przekierowywać oczekujących zleceń po zmianie `.env`.

Przygotować jawne konfiguracje połączeń z kontenerów web/worker do usług na hoście oraz trwałe dane runtime i archiwum. Nie zakładać, że localhost workera jest hostem. Konfiguracja narzędzi i zależności OpenCode/MCP ma przypięte wersje. Nie pobierać modelu i nie włączać chmury automatycznie.

## Weryfikacja i gotowość

| Kryterium | Plan weryfikacji |
| --- | --- |
| E08-AC01 | Model gpt-oss:20b z GET /api/tags, jawny dostawca lokalny, brak OpenAI i fallbacku; health/wersja OpenCode. |
| E08-AC02 | T01/T02/T03; dwaj workerzy, dwie firmy, restart i wygasły lease; najwyżej jeden agent i właściwa sesja. |
| E08-AC03 | Końcowy wynik właściwej wiadomości, zły JSON, zmyślony dowód/URL/cytat, brak findings; stary raport dostępny. |
| E08-AC04 | Brak kwot pracy, abort kontra publikacja, unknown blokuje kolejkę, retry queued do potwierdzonego końca starego; interwencja i idempotentne resume. |
| E08-AC05 | Próba powłoki/plików/delegacji, cudzy kontekst MCP, stare narzędzie po zmianie slotu; odmowa techniczna, nie tylko prompt. |
| E08-AC06 | Lokalny koszt zero i nieznane usage, archiwum mimo błędu, restart/wymiana procesu zachowują dane. |

Bramki T01–T05 opisuje [kontrakt runtime](../../kontrakty-runtime.md). To plan sprawdzeń, nie wykonane wyniki. Atrapy nie dowodzą działania live. Nie wymagamy benchmarku jakości modelu. Etap 8 może testować komendy/interwencję bez gotowego UI panelu; panel integruje te kontrakty po etapach 6/8, przed odbiorem 9. Przy implementacji zachowania stosować projektowy workflow implement-with-tester.

## Weryfikacja uzupełnień grill-me

E08-AC02/04 testować z profilem i oceną oczekującymi obok researchu: wspólny slot, bez równoległej pracy, także po utracie lease. E08-AC03 testuje snippet niedopuszczony jako dowód i raport z niewiadomymi po próbie sprawdzenia kategorii. E08-AC06 dopuszcza usunięcie zakończonego profilu Chrome po archiwizacji, ale nie materiałów sesji. Test awarii wymaga braku automatycznej naprawy infrastruktury; procedura ręczna jest elementem instrukcji operatora. Źródła wymagające logowania są pomijane; parkowanie sesji poza obecnym zakresem.

## Domknięcie projektu wykonawczego — 2026-11-05

Wersje bazowe i kwalifikacja: [334.21](../../kwalifikacja-runtime.md). Headless Chrome w kontenerze i prywatny DevTools zachowują ręczną interwencję, stan sesji i blokujący slot. Nie tworzyć nowego profilu po kliknięciu Wznów. Uprawnienia i kanały sprawdzać technicznie; oficjalna dokumentacja nie dowodzi izolacji tej instalacji.

Konfiguracja serwerowa `AI_RUNTIMES_JSON`: strict lista `{ref:string,version:positiveInteger,endpointRef:string,endpointVersion:positiveInteger,runtimeLockRef:string,dataRoot:string,workspaceRoot:string}`. Para ref/version unikalna; endpoint wskazuje wersjonowany rejestr z etapu 5, runtimeLockRef zatwierdzony manifest kwalifikacji. dataRoot/workspaceRoot to absolutne katalogi dedykowanej usługi przygotowane przez operatora, nie ścieżki z UI/modelu. Brak wpisu/danych/wersji blokuje wykonanie bez użycia aktualnego domyślnego runtime. W migawce zachować ref/version i hash manifestu; przy retry nie aktualizować ich. Poświadczenia HTTP są rozwiązywane przez credentialEnv po stronie serwera, nigdy nie trafiają do promptu ani artefaktów.

Nowe `ai_agent_sessions` i dane zdarzeń powstają w tym etapie na fundamencie etapu 5/7. directory = bezpieczny podkatalog workspaceRoot wygenerowany z execution UUID; korelacja creation_key ma własny UUID i tytuł techniczny, nie dane firmy. W module firm company_research.current_execution_id/current_publication_token oraz ai_attempts.execution_id powiązać addytywnie. Przy ręcznym retry tworzymy wykonanie pod tą samą operacją firmy, bez nowej company_research omijającej indeks pending. Zachować starsze researchy i mapowanie wersji raportów. Bieżący raport zmienia tylko validateResearch + publikacja pod blokadą tokenu.

Nie utrzymywać jednej transakcji lub dostawy pg-boss przez cały research. Orkiestrator agenta ma krótkie `advance(executionId)` realizujące create/start/inspect/collect z dziennikiem; pending/waiting_user planuje dalszą obserwację istniejącej sesji. Nie rozszerzać synchronicznego StructuredModel o narzędzia/sesje. Wynik collect mapować na completed/failed/unknown/cancelled oraz draft/evidence/accounting z interfejsu researchu etapu 4. Lokalny accounting ma koszt API zero i osobne nullable usage; brak płatnej wyszukiwarki nie tworzy fikcyjnego kosztu. Ewentualne przyszłe płatne narzędzia wymagają osobnego projektu/rezerwacji, nie są w tym wydaniu włączone.

Żądania: zapisz prepared wraz z fingerprintem i message ID; po commit sprawdź generation, oznacz sent i wykonaj HTTP; zapisz odpowiedź. Okno awarii między sent a HTTP jest celowo konserwatywne: rekoncyliacja, nie drugi start. Utracony create sprawdzamy pełną listą/korelacją; niejednoznaczność unknown. Dla start/resume inspekcja wskazuje konkretną zapisaną wiadomość. Nie wyciągać „ostatniej wiadomości z JSON” z przypadkowej sesji. SSE przechowujemy z deduplikacją, jeśli ma stabilne ID; brak replay jest luką widoczną w archiwum, a nie fikcyjną ciągłością.

T02 końca wymaga jednocześnie: przypisanej finalnej wiadomości po danym start/resume z zakończonym czasem/stanem według /doc, potwierdzonej nieaktywności tej sesji, braku trwających wywołań mostu/interwencji i zamkniętego kontekstu Chrome. Końcowy raport musi być jednym JSON, odrębna walidacja domeny może go odrzucić. Sam idle/puste status map, HTTP 200 abort, zerwanie SSE lub brak sesji nie jest dowodem. Gdy przypięta wersja nie pozwala rozpoznać końca, zachować unknown i przygotować ręczne zakończenie dedykowanej instancji z dowodem procesu; nie uruchamiać kolejnej pracy.

Kwalifikacja i testy adaptera sprawdzają także brak niejawnej automatycznej generacji naprawiającej JSON, transportowego ponowienia inferencji o nieznanym skutku i obcinania wejścia. Parametry fizycznego kontekstu muszą odpowiadać migawce i rzeczywistej konfiguracji runtime. Nie zgadywać nazw opcji SDK; wynik kwalifikacji zawiera sprawdzone ustawienia. Jeżeli wybrana wersja nie daje wymaganego zachowania, etap nie jest ukończony — poprawić integrację lub wrócić z konkretną rozbieżnością, bez osłabienia LA.

Minimalne testy: create response lost, start 204 lost, duplikat message ID, poll po restarcie, dwa workery/lease, abort accepted lecz nadal running, pending tool po idle, race retry/publikacja, utracona karta przy resume, stale generation/cudze evidence i wyłączone narzędzia. Atrapy HTTP/PG dowodzą zachowania aplikacji; T01/T02/T03/T05 na rzeczywistych wersjach dowodzą protokołu. E08-AC01–06 i brak benchmarku jakości bez zmian. Gotowy panel nie jest zależnością wykonawcy: testy używają komend domenowych i interwencji mostu, co zapobiega cyklowi.
