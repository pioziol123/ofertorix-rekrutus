# Etap 8: OpenCode jako agent researchu z gpt-oss:20b — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 8 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.9`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E08-R01–E08-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Propozycja: dedykowany opencode serve i adapter w lib/ai/opencode/. Worker startuje lub obserwuje sesję przez HTTP. ResearchExecutor etapu 4 otrzymuje implementację OpenCode; moduł firm nadal waliduje i publikuje wynik. OpenCode łączy się ze skonfigurowanym endpointem Ollamy; nie korzysta wewnętrznie z aplikacyjnego StructuredModel. Narzędzia otrzymuje przez most etapu 7.

## Decyzja E08-D01 — Headless sesje OpenCode za adapterem

**Propozycja:** CLI jest alternatywą pilota, ale długie zadania wymagają obserwacji i anulowania po restarcie workera. Server jest propozycją do potwierdzenia, a nie dowodem spełnienia recovery.

Punkty integracji w obecnym katalogu: [lib/companies/research.ts](../../../../../lib/companies/research.ts), [lib/companies/research-model.ts](../../../../../lib/companies/research-model.ts), [worker/index.ts](../../../../../worker/index.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

Proponowany adapter: createSession(operationId), start(sessionId,target), inspect(sessionId), cancel(sessionId), collect(sessionId). Wewnętrzny stan: creating | ready | running | cancelling | completed | failed | cancelled | unknown. Jest to kontrakt aplikacyjny, nie deklaracja nazw statusów z API OpenCode. Mapowanie do przypiętej wersji runtime wymaga pilota. HTTP200, idle albo EOF strumienia nie oznacza poprawnego raportu.

Addytywna tabela ai_agent_sessions: operation_id UUID UNIQUE NOT NULL, runtime='opencode', runtime_version text NOT NULL, session_id text UNIQUE NULL, creation_key UUID UNIQUE NOT NULL, state text NOT NULL, last_event_id text NULL, lease_owner UUID NULL, lease_until timestamptz NULL, created_at/updated_at, finished_at NULL. operation_id wskazuje konkretny research. session_id=null jest dozwolone tylko podczas creating/unknown po niepewnym create. Retencja obejmuje oddzielne dane OpenCode i materiały aplikacji.

Sekwencja: trwałe creating z creation_key → utworzenie pustej sesji z korelacją → zapis session_id → start zlecenia. Nie uruchamiać promptu przed trwałym zapisem session_id. Po awarii create/list sesji musi dać jednoznaczną korelację; jeśli przypięty runtime tego nie zapewnia, przejść unknown i wymagać rozstrzygnięcia, zamiast tworzyć nową sesję. Analogicznie sprawdzić brak duplikacji promptu po utracie odpowiedzi start: odczytać wiadomości konkretnej sesji, nie powtarzać ślepo start. Dopiero jednoznacznie rozstrzygnięta operacja może otrzymać nowe wykonanie.

Sesja zbiera dowody przez narzędzia; końcowy wynik zawiera wyłącznie JSON researchDraft, sprawdzany przeciw magazynowi dowodów operation ID przez validateResearch. Końcowa synteza należy do tej samej sesji OpenCode; aplikacja nie prowadzi drugiej pętli narzędzi. Jeśli wersja runtime nie zapewnia wiarygodnego pobrania końcowego wyniku, pilot blokuje integrację, zamiast parsować dowolny komunikat jako raport.

W pilocie sprawdzić efektywną konfigurację OpenCode i dostawcy: brak maxSteps, kwot wywołań/tokenów oraz timeout całej sesji narzuconych lokalnej pracy. Domyślne ograniczenie runtime nie może po cichu zastąpić zakazu kwot w aplikacji; jeśli nie da się go usunąć, jest to niespełnienie LA-08 wymagające zgłoszenia, a nie akceptacja nowego limitu. Fizyczny kontekst nadal podlega kontroli O-L1.

Krótki lease koordynatora i odnawiane dostarczenia nie ograniczają długości sesji. Unknown oraz cancelling blokują utworzenie kolejnego aktywnego researchu dla tej samej firmy do rozstrzygnięcia; uwzględnić to w blokadzie komendy, nie tylko w lease. Recovery odczytuje jej rzeczywisty stan; unknown nie tworzy nowej sesji. Anulowanie najpierw zapisuje cancelling, wysyła abort, a po potwierdzeniu kończy cancelled; brak potwierdzenia to unknown. Publikacja pod blokadą odrzuca wynik, jeśli w międzyczasie zapisano anulowanie.

Dedykowane katalogi danych/config i pusty katalog roboczy; brak globalnych kluczy, MCP, repo rules i pluginów. Uprawnienia deny jako domyślne, allow tylko dla mostu narzędzi. Izolację uprawnień sprawdzić także na poziomie procesu/egress, nie tylko promptu. Dostęp do headless API wyłącznie z workera, z uwierzytelnieniem; logi nie zawierają sekretów. Propozycja retencji: usunięcie sesji i surowych zdarzeń 7 dni po stanie terminalnym, bez usuwania dowodów opublikowanego raportu; aktywnych/unknown nie usuwać automatycznie. Termin wymaga uzgodnienia w O-L3.

## Migracja i uruchomienie

Nowe tabele/indeksy sesji i stany researchu cancelled/cancelling wraz z indeksem aktywnych operacji; ai_attempts pozostaje dziennikiem kosztów. Canonical firmy-research requirements/SD oraz operacje uzupełnić o nowego wykonawcę. Usługę wdrożyć oddzielnie i przypiąć wersję po pilocie. Włączenie tylko nowych ręcznych zleceń, bez migracji starych sesji OpenAI.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Adapter fake server: create/start/inspect/events/abort/collect i błędne statusy/formaty.
2. Crash matrix: przed/po create, przed/po zapisie ID, przed/po start, po wyniku przed commit; brak podwójnej sesji i publikacji.
3. Realny pilot przypiętej wersji: narzędzia, końcowy JSON, długi przebieg bez kwot, restart workera/OpenCode, abort i retencja.
4. Próby niedozwolonych narzędzi, prompt injection, pomieszania sesji, błędnych dowodów i częściowego płatnego kosztu.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E08-AC01 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E08-AC02 | Próby 1–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E08-AC03 | Próby 1, 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E08-AC04 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E08-AC05 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E08-AC06 | Próby 3–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

O-L3 jest bramką: wersja i korelacja sesji, rozpoznanie startu/wyniku, anulowanie, odtwarzanie i retencja. Proponowana tabela nie dowodzi, że obecne API spełnia kontrakt. O-L2 musi być zamknięte przez etap 7. Nie ma otwartej decyzji o modelu, runtime ani kwotach Ollamy.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.

## Źródła integracji

Zweryfikowano 2026-11-04: [server API](https://opencode.ai/docs/server/) opisuje headless HTTP i sesje; [permissions](https://opencode.ai/docs/permissions/) opisuje allow/deny/ask; [integracja Ollama–OpenCode](https://docs.ollama.com/integrations/opencode) opisuje lokalnego dostawcę. Korelacja awarii, końcowy raport i izolacja procesu pozostają przedmiotem pilota, a nie gwarancją wynikającą z samej dokumentacji.
