# Etap 7: Wyszukiwanie i odczyt stron dla OpenCode — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Beads: `oferty-pracy-334.8`. Google przez Chrome i Chrome DevTools MCP wybrane, cookies/archiwum/interwencja zatwierdzone; działanie live wymaga sprawdzenia.

Podstawa: [Requirements](requirements.md), [LA-07–LA-15](../../requirements.md), [kontrakty runtime](../../kontrakty-runtime.md). Kontrakty runtime są wspólną normatywną częścią tego SD, etapu 8 i panelu. Nie tworzymy własnej przeglądarki ani pętli agenta. Playwright nie wchodzi do integracji.

## Podejście i granice

OpenCode → kontrolowany most MCP → przypięty chrome-devtools-mcp → dedykowany headless Google Chrome w kontenerze. Most przekazuje gotowe operacje Chrome oraz zapisuje faktycznie otrzymane materiały przed podaniem ich modelowi. OpenCode wybiera kroki i prowadzi rozmowę; moduł firm odpowiada za interpretację i publikację raportu.

Google używamy przez przeglądarkę, bez płatnego search API i bez wbudowanego zewnętrznego websearch OpenCode. Zapytania bez CV i pełnego profilu właściciela. Google nie ma gwarantowanej dostępności; blokada daje interwencję, nie automatyczne obchodzenie lub zmianę dostawcy.

## Stan bazowy

[research-model.ts](../../../../../lib/companies/research-model.ts) definiuje ResearchEvidence i validateResearch: cytat musi pochodzić z tekstu właściwego dowodu i mieć bezpieczne źródła. [research-provider.ts](../../../../../lib/companies/research-provider.ts) zbiera materiał OpenAI w pamięci; finalny raport nie jest archiwum surowych odczytów. Nowe trwałe archiwum jest konieczne dla LA-13. Wzorzec niezmiennych artefaktów i hashy istnieje w [matching/archive.ts](../../../../../lib/matching/archive.ts), lecz nie jest integracją researchu.

## E07-D01 — Most z kontrolą narzędzi i archiwizacją

Zestaw operacji i filtr argumentów, powiązanie execution ID, profile Chrome, zapis narzędzi i dowodów są w sekcjach „Chrome i most MCP” oraz „Archiwum i dowody” kontraktów runtime. Wcześniejsze search/readPage to opis celu, nie obowiązek budowy silnika wyszukiwania ani zastąpienia gotowych narzędzi Chrome.

Most jest częścią integracji w tym repo, bez osobnego interfejsu użytkowego. Rejestruje wywołanie przed wykonaniem oraz odpowiedź przed udostępnieniem agentowi. Nie wyprowadza dowodów wyłącznie z końcowego raportu modelu. Sam tekst strony i argument operationId od modelu nie nadaje uprawnień ani własności materiału.

## E07-D02 — Stan per wykonanie i interwencja

Czysty profil Chrome dla nowego execution ID; własna sesja OpenCode. Cookies pozostają w obrębie wykonania podczas oczekiwania i wznowienia. Bez osobistych kont i logowania; nie przyłączamy się do codziennego Chrome. Nowe wykonanie nie dziedziczy kart/cookies poprzedniego, a materiały poprzedniego nadal pozostają w archiwum.

request_intervention zapisuje powód i oczekiwanie, wykonuje screenshot lub zapisuje błąd przechwycenia. Użytkownik otwiera uwierzytelniony podgląd DevTools tej samej karty, usuwa blokadę i wybiera „Wznów” w panelu. Rozwiązujemy tę samą interwencję, bez nowego wykonania. Oczekiwanie zajmuje wspólny lokalny slot i nie ma automatycznego deadline. Brak możliwości odtworzenia Chrome jest jawny.

## E07-D03 — Izolacja sieci i materiałów

Narzędzia tylko do dozwolonego researchu publicznego. Nie udostępniać plików, powłoki, dowolnego evaluate_script, uploadu ani ścieżek zapisu modelowi. Chronić cały ruch Chrome przed siecią lokalną/prywatną, nie tylko parametr navigate_page. Izolacja obejmuje DNS/IPv6/redirect, iframe, subresources i WebSocket. Konfiguracja proxy bez dowodu braku obejścia nie wystarcza. T04 blokuje publiczny research do weryfikacji środowiska.

Odczyt snapshot jest materiałem widocznym w drzewie dostępności, nie gwarancją pełnej strony. Zapisujemy dokładny tekst przekazany modelowi; częściowy odczyt ma jawne oznaczenie. Search snippet nie zamienia się w dowód strony bez jej odczytu. Zrzuty przy blokadach/błędach/interwencji i cała rozmowa/narzędzia pozostają bezterminowo; bez domyślnego archiwizowania wszystkich zasobów i pełnego ruchu sieci.

## Migracja i uruchomienie

Zależność implementacyjna: etap5 (`oferty-pracy-334.6`) dostarcza execution ID, wspólną kolejkę i slot. Most korzysta z tych rekordów, bez tworzenia konkurencyjnej infrastruktury. Same próby protokołu Chrome można wykonać wcześniej, ale nie zastępują integracji z wykonaniem.

Addytywne archiwum obserwacji per execution ID oraz integracja z istniejącym ResearchEvidence. Nowy materiał nie zmienia historycznych raportów OpenAI. Wersje MCP/Chrome/OpenCode i konfiguracja własnego profilu są jawne; statystyki i niepotrzebne funkcje performance wyłączone. Nie instalujemy Playwrighta. Nie wprowadzamy kwot liczby lokalnych rund/wywołań.

## Weryfikacja i gotowość

| Kryterium | Plan weryfikacji |
| --- | --- |
| E07-AC01 | Atrapa i techniczny dostęp do Google; brak płatnego search API i cichego fallbacku. |
| E07-AC02 | T05: rzeczywisty tekst, metadane, idempotentne ID, screenshot, snippet/page, odczyt częściowy i awaria archiwum. |
| E07-AC03 | T04: cały ruch Chrome, próby prywatnego DNS/IPv6/redirect/iframe/subresource/WebSocket i obejścia proxy. |
| E07-AC04 | 403/429/blokada/CAPTCHA, awaria narzędzia, pusty/częściowy snapshot bez fikcyjnego dowodu. |
| E07-AC05 | T03/T05: dwa kolejne wykonania i wznowienie tego samego, cudze ID/karty, stary most po zmianie slotu, instrukcje w stronie. |
| E07-AC06 | Ochrona pojedynczego odczytu nie staje się limitem lokalnych rund, tokenów i całej sesji. |

Testy narzędzi i archiwum można wykonać bez LLM. Przed live sprawdzić T03–T05 z kontraktów runtime i zapisać wersje/wyniki; same źródła oficjalne nie potwierdzają izolacji. Nie wymagamy benchmarku jakości odpowiedzi. Przy implementacji zachowania stosować implement-with-tester. Źródła zweryfikowane 2026-11-05 i dokładne granice gwarancji są zebrane w kontraktach runtime.

## Publiczne źródła i sprzątanie — po grill-me

Obowiązują LA-19–21: snippet Google służy tylko nawigacji/archiwizacji; fakt/opinia wymaga dowodu odczytanej strony. E07-AC02 sprawdza odrzucenie twierdzenia opartego tylko na snippet. E07-AC05 sprawdza brak danych właściciela w narzędziach: dozwolone wyłącznie dane firmy i stanowiska. E07-AC04 sprawdza próbę innych znalezionych publicznych źródeł przy blokadzie pojedynczej strony. Stron wymagających konta nie otwieramy przez logowanie i nie czekamy na zalogowanie. CAPTCHA/zgoda blokująca publiczną pracę może wymagać interwencji.

Profil Chrome z cookies/cache jest usuwalnym stanem roboczym po potwierdzonym końcu i zapisie materiałów. Aktywność lub interwencja zachowuje ten sam profil. E07-AC05 wymaga, aby sprzątanie zakończonego profilu nie usunęło dowodów, rozmów, zdarzeń ani raportów i nie dotknęło aktywnego profilu. Parkowanie sesji i logowanie dopiero w backlogu281, poza tym wydaniem.

## Domknięcie projektu wykonawczego — 2026-11-05

Zależności: etap 5 oraz [kwalifikacja runtime](../../kwalifikacja-runtime.md), `334.21`. Ta ostatnia dostarcza konkretny manifest i konfigurację headless Chrome w kontenerze, nftables/proxy i prywatnego CDP z podglądem DevTools. Własność nowych plików: `lib/ai/browser/` dla mostu i procesu MCP, `lib/ai/operations/` dla tokenów/kolejki, osobny moduł archiwum wykonania; konfiguracje/launchery w repo. Nie przenosić do mostu reguł raportu ani sterowania rozmową.

Publiczny interfejs mostu to standardowe MCP tools/list i tools/call. Schematy dozwolonych narzędzi pobrać z przypiętej wersji, utrwalić ich hash. Narzędzie/niedozwolony argument daje bezpieczny błąd przed akcją; nie przekazywać nieznanych pól dalej. Narzędzia kart/nawigacji nie dopuszczają file/data/javascript URL ani zewnętrznego page/target ID. Prawdziwe target ID wiąże magazyn kontekstu danego execution, nigdy globalna „ostatnia karta”. Strony błędu lub CAPTCHA nie stają się dowodem faktów firmy.

Każdy odczyt/nawigacja ma unikalny call ID i zapis intencji przed dispatch. Most uruchomiony dla execution dostaje dedykowane poświadczenie archiwum i generation; archiwizuje znormalizowaną odpowiedź oraz surową odpowiedź narzędzia przed zwróceniem modelowi. Obsługa duplikatu zwraca poprzednio zapisany wynik, payload konfliktuje. Awaria po akcji, przed zapisem daje unknown akcji; nie powtarzać click/navigation automatycznie. Recovery najpierw ogląda bieżący target i zgromadzone materiały; samo ponowienie dostawy MCP nie daje prawa ponownego efektu.

Użyć `ai_execution_artifacts` dostarczonego w etapie 5 dla direct; dodać `ai_tool_calls`, `ai_evidence` i `ai_interventions` z FK execution_id, unikalnym call ID per execution i UNIQUE(execution_id,evidence_id). Stan archiwum, SHA-256 i obiekt trwały według runtime. Interwencja: id UUID, execution_id, reason, page_id, state pending/resolved/failed, screenshot_artifact_id nullable, screenshot_error nullable, resolved_command_id nullable, daty. Unikalna jedna pending interwencja per execution. Ze screenshot error nadal zapisać oczekiwanie i powód; brak zrzutu jest jawny.

Limit bezpieczeństwa pojedynczego wyniku narzędzia: 1 MiB UTF-8 tekstu przekazanego modelowi; nadmiar kończy na granicy kodowania, oznacza readStatus=partial i zapisuje dokładnie zwrócony fragment jako dowód. Pełny surowy wynik narzędzia zachować osobno, o ile został faktycznie otrzymany; błąd archiwum nie jest podstawą jego skasowania. Argumenty pojedynczego wywołania do 64 KiB, bez własnych ścieżek zapisu. Ochrona nie ustala sumy rund/tokenów/czasu zadania. Screenshot i sesje nie podlegają temu tekstowemu limitowi; awaria dysku pozostaje błędem infrastruktury. Te liczby są decyzją techniczną bezpieczeństwa pojedynczej wiadomości, nie zmianą zakresu produktu.

Testy bez modelu: legalny odczyt, snippet versus page, partial, brak metadanych, archiwum niedostępne, zduplikowany call ID, cudzy context, stary generation, prompt injection, screenshot failure i wznowienie tej samej pending interwencji. T03/T04 z kwalifikacji powtórzyć na finalnej konfiguracji, T05 na zintegrowanym archiwum. E07-AC01–06 muszą mieć odnośniki do konkretnych testów/dowodów; kwalifikacja nie zamyka implementacji mostu.
