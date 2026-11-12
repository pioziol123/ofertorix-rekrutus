# Przegląd architektury według codebase-design

Data: 2026-11-05. Beads: `oferty-pracy-ijo`.

Zakres: przegląd aktualnego katalogu roboczego, w tym zastanych zmian `lib/profile/ai.ts`, nowego `lib/ai/models/` i dokumentacji lokalnego AI. To rekomendacje projektowe, nie zatwierdzenie nowych kontraktów ani dowód działania integracji. Nie zmieniano kodu aplikacji.

## Wniosek

Największą korzyść przyniesie dokończenie rozdzielenia reguł profilu i ocen od protokołów wykonania AI. Istniejący plan `lokalne-ai` wskazuje właściwy kierunek, lecz samo przeniesienie funkcji lub dodanie klasy adaptera nie wystarcza: konsumenci muszą przestać znać format odpowiedzi dostawcy, zasady transportu i stany jego partii.

Osobną możliwością jest wspólny moduł zlecania synchronizacji źródeł. Powtarzany jest tam rzeczywisty protokół transakcji i kolejki. Rekomenduję najpierw prace AI z istniejącego planu, a ten refaktor ocenić przed dodaniem kolejnego importera.

Ocena używa pojęcia głębokości modułu ze skilla: ile zachowania otrzymuje konsument w stosunku do wiedzy potrzebnej do poprawnego użycia interfejsu. Długość pliku sama w sobie nie stanowi problemu architektonicznego.

## 1. Wspólna konfiguracja i budżet: poprawić kierunek zależności

**Dowody:** `lib/profile/ai.ts:62` definiuje `AiConfiguration`, `:72` odczyt konfiguracji, `:101` kalkulację kosztu, `:128` rezerwację budżetu. Importują je m.in. `lib/matching/store.ts:7`, `lib/matching/batch.ts:3`, `lib/companies/research.ts:5` i `lib/companies/research-provider.ts:2`.

Profil jest obecnie właścicielem mechanizmu potrzebnego także ocenom i researchowi. Zmiana wspólnej polityki finansowania wymaga wejścia do modułu profilu, a konsumenci przejmują tę zależność.

**Rekomendacja:** zrealizować istniejący etap 1: konfiguracja i budżet w `lib/ai/`, bez zależności zwrotnej do profilu. Traktować to jako uporządkowanie własności, nie jako samodzielne zwiększenie głębokości modułu. Rezerwacja nadal powinna korzystać z przekazanego klienta transakcji, tak aby zapis zlecenia, rezerwacji i pracy w kolejce pozostał atomowy.

**Koszt i ograniczenia:** nie budować przy okazji uniwersalnego systemu operacji. Profil, Batch i research mają różne znaczenie restartu, nieznanego wyniku oraz ponowienia. Wspólny dziennik kosztów nie oznacza identycznego cyklu wykonania.

**Weryfikacja przy realizacji:** arytmetyka kwot, miesiąc w Europe/Warsaw, współbieżne finansowanie i koszt nieznany; regresje istniejących integracji profilu, ocen i researchu. Zmiany zasad lokalnego kosztu zero należą do właściwego etapu planu.

**Istniejący zakres:** `oferty-pracy-334.2`, `docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/solution-design.md`.

## 2. Model strukturalny: adapter powinien ukrywać protokół dostawcy

**Dowody z roboczej implementacji:**

- `lib/ai/models/model.ts:11` wprowadza `StructuredModel`, ale `:17–22` wystawia m.in. `reasoning`, `store`, `tools` i `serviceTier`.
- `lib/ai/models/openai.ts:79–83` zawsze zwraca `outcome: 'completed'`, a do `text` wkłada zserializowaną całą odpowiedź OpenAI.
- `lib/profile/ai.ts:358` sam tworzy `OpenAiAdapter`; `:373–385` odtwarza tę odpowiedź, a `readAiProposal` w `:24–51` nadal wymaga pól `status`, `output`, `message` i `output_text`.
- Adapter w `lib/ai/models/openai.ts:57–94` sprowadza błędy do zwykłych wyjątków `retryable`/`non-retryable`. Konsument w `lib/profile/ai.ts:368` ustawia `requestStarted` dopiero po zakończeniu wywołania i w `:388` wnioskuje o ponowieniu z lokalnych flag.

Obecny interfejs nadal wymaga znajomości OpenAI. Przeniesienie HTTP do klasy nie daje jeszcze niezależności profilu od dostawcy. Opisane miejsca to stan rozpoczętej pracy, nie ocena ukończonego wdrożenia.

**Rekomendowany interfejs:** jedna operacja generowania odpowiedzi strukturalnej. Wejście obejmuje instrukcję, dane i jednoznacznie określony format schematu. Wynik zawiera tekst odpowiedzi, rzeczywisty stan ukończenia/odmowy/niepełnego wyniku, identyfikator oraz znane lub nieznane użycie. Błąd musi zachować informacje potrzebne istniejącej polityce wykonania i rozliczenia; nie można ich odtwarzać z tekstu komunikatu.

**Co ukryć:** format Responses, odczyt treści, rozpoznanie odmowy i niepełnej odpowiedzi, HTTP oraz interpretację nagłówków. Ustawienia specyficzne dla dostawcy trafiają do konfiguracji jego adaptera, w zakresie potrzebnym istniejącemu zachowaniu. Moduł profilu zachowuje instrukcje domenowe, `checkProposal`, weryfikację cytatów i publikację propozycji. Adapter należy przekazać wykonawcy z miejsca składania zależności.

**Korzyść:** OpenAI, przyszła Ollama i adapter testowy dostarczają ten sam rodzaj wyniku; profil nie rekonstruuje cudzej odpowiedzi. Nie rozszerzać tego interfejsu o sesje agenta OpenCode ani cykl Batch — mają inne zachowanie.

**Weryfikacja przy realizacji:** testy profilu przez jego operacje z adapterem testowym; testy kontraktu adaptera OpenAI na odpowiedziach HTTP. Odmowa, niepełna odpowiedź, błędny JSON i niepoprawny cytat nie zmieniają profilu; koszt pozostaje rozliczany niezależnie od poprawności treści. Zachować wymaganą politykę retry etapu 2, a późniejszą zmianę zasad wykonywać w przeznaczonym do tego etapie.

**Istniejący zakres:** `oferty-pracy-334.3` i `oferty-pracy-334.6`.

## 3. Dopasowanie: neutralne zadanie i publikacja, osobne wykonanie Batch

**Dowody:** `lib/matching/store.ts:113–135` przy przygotowaniu oceny tworzy już żądanie Responses i rekord `matching_batches`. `applyMatchingLine` w `:200–273` przyjmuje `BatchLine` i `Batch`, interpretuje błędy partii, rozlicza koszt, waliduje ocenę i publikuje rating. Zarazem ta funkcja jest już współdzielona: korzystają z niej wykonanie pojedyncze (`store.ts:482`) i grupowe (`lib/matching/groups.ts:444`).

Przyszły lokalny wykonawca potrzebuje tych samych reguł oceny i publikacji, ale nie potrzebuje `custom_id`, plików OpenAI ani stanów uploadu. Wymuszenie na nim formatu Batch zwiększyłoby interfejs, który musi znać.

**Rekomendacja:** zadanie dopasowania opisuje zapisane wejście i jego wersje, instrukcje oraz schemat. Adapter Batch tłumaczy je na swój protokół. Wspólna publikacja przyjmuje znormalizowany wynik wykonania i identyfikator zlecenia, sama pobiera autorytatywną migawkę oraz pilnuje jednokrotnej publikacji i aktualności.

**Co zachować:** istniejącą współdzieloną publikację ratingów i kontrole dowodów. Nie tworzyć dwóch nowych publikatorów dla OpenAI i Ollamy. Archiwum, upload/create/poll i niepewność utworzenia partii pozostają w wykonaniu Batch. Etap 3 może zachować zgodne fasady i obecny schemat danych; lokalne wykonanie dochodzi w etapie 6.

**Weryfikacja przy realizacji:** ponowne dostarczenie nie tworzy kolejnej rewizji; stary wynik nie staje się aktualny; częściowy błąd grupy zachowuje poprawne wyniki; niepoprawna treść nie usuwa danych o płatnym użyciu. Istniejące testy `matching.integration`, `matching-groups.integration`, `matching-ratings.integration` i `matching-archive.integration` są punktem wyjścia. Nowe testy publikacji mają sprawdzać zachowanie przez jej interfejs, bez utrwalania prywatnego podziału funkcji.

**Istniejący zakres:** `oferty-pracy-334.4` i `oferty-pracy-334.7`.

## 4. Synchronizacja: jeden moduł transakcyjnego zlecania

**Dowody:** `lib/sources/sync.ts:28–79`, `lib/sources/polish-sync.ts:56–106` i `lib/sources/jobspy-sync.ts:57–100` powtarzają blokadę, wybór aktywnego przebiegu, zapis zakresu, utworzenie przebiegu, `boss.send` na tym samym kliencie transakcji i zapis identyfikatora pracy.

To rzeczywista wspólna odpowiedzialność: poprawka atomowości musi być dziś rozważana w kilku miejscach. Jednocześnie występują ważne różnice: SOLID sprawdza aktywny przebieg dla zakresu i ma harmonogram, Polish/JobSpy dla źródła; różnią się czasy wykonania i sposób rozpoznawania częściowego wyniku.

**Rekomendacja:** rozważyć wewnętrzny moduł `enqueueSourceRun`, który ukrywa cały zapis i dostarczenie pracy. Jego dane wejściowe opisują źródło, zakres i jawną politykę deduplikacji/harmonogramu. Jeżeli wymagałby zestawu callbacków z SQL i kolejnością kroków podawaną przez każdego konsumenta, nie zapewniłby uproszczenia — wtedy zakres trzeba zmniejszyć do naprawdę wspólnego protokołu.

**Koszt i ograniczenia:** nie ujednolicać przy okazji reguł kompletności importerów ani nie zmieniać deduplikacji z poziomu źródła na zakres. Pobieranie, limity i interpretacja danych pozostają przy konkretnych źródłach. To kandydat do oceny, poza bieżącym planem AI.

**Dalsza ocena:** `oferty-pracy-slu`, status do triage, bez oznaczenia gotowości do implementacji.

**Weryfikacja przy realizacji:** brak pracy w kolejce oznacza rollback przebiegu; równoległe żądania zachowują dotychczasową deduplikację; harmonogram SOLID nadal działa; testy konkretnych importerów zachowują rozróżnienie pełnej i niepełnej synchronizacji. Korzystać z istniejących testów integracyjnych PostgreSQL/pg-boss, bez nowej warstwy pozornych repozytoriów.

## Research: zachować istniejącą głębokość

`lib/companies/research.ts:56` udostępnia żądanie researchu, `:132` wykonanie, `:198` odzyskiwanie i `:252` odczyt. Konsument nie musi sam rezerwować budżetu, tworzyć próby i wysyłać zlecenia. To już jest istotna głębokość modułu, mimo wielu szczegółów wewnątrz pliku.

Przy drugim wykonawcy warto zastosować istniejący etap 4: przekazać wykonawcę zamiast wywoływać bezpośrednio `runResearch` (`research.ts:164`). Moduł firm powinien nadal kontrolować reuse/refresh, wersje raportów i akceptację dowodów. Samo rozbicie pliku na `request/fund/claim/settle/recover` dostępne publicznie przerzuciłoby obowiązek znajomości kolejności na konsumentów.

## Zakres sprawdzenia i ograniczenia

- Sprawdzono kod, jego konsumentów, istniejące testy i projekty etapów AI; rekomendacje są analizą statyczną.
- Nie uruchamiano usług ani płatnych wywołań. Nie zmieniano kodu aplikacji, specyfikacji ani decyzji architektonicznych.
- Próba uruchomienia trzech zestawów testów (`profile.test.ts`, `matching-batch.test.ts`, `company-research.test.ts`) nie doszła do wykonania: Corepack nie mógł zapisać cache poza piaskownicą, a bezpośrednie wywołanie potwierdziło brak lokalnej instalacji Vitest. Nie ma nowego wyniku PASS ani FAIL testów aplikacji. Instalowanie zależności nie było potrzebne do tego przeglądu.
- Wyszukiwanie semantyczne `jbcontext` wymagało logowania do JetBrains AI Platform; wykorzystano odczyt plików i wyszukiwanie tekstowe.
- Dokumenty opisujące plan nie dowodzą jego implementacji. Zastane zmiany robocze pozostawiono do dalszej pracy ich autora.

Podstawa: skill `mattpocock-skills:codebase-design` (`SKILL.md`, `DEEPENING.md`), `GLOSSARY.md`, aktualne pliki kodu i testów, `docs/specs/pierwsza-wersja/architecture.md` oraz `docs/specs/lokalne-ai/`.
