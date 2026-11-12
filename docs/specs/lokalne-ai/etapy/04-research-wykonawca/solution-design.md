# Etap 4: Research niezależny od wykonawcy OpenAI — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 4 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.5`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

Zakres normatywny zachowania: [Requirements](requirements.md), E04-R01–E04-R04. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

lib/companies/research.ts posiada komendy, migawkę celu, kolejkę, reuse/refresh, próby i publikację. lib/companies/research-provider.ts staje się wykonawcą OpenAI za małym ResearchExecutor; lib/companies/research-model.ts pozostaje właścicielem researchDraft, ResearchEvidence i validateResearch. Nie rozbijamy web_search na fikcyjny uniwersalny provider wyszukiwania.

## Decyzja E04-D01 — Wykonawca całego researchu OpenAI

**Decyzja techniczna:** Zastąpienie wbudowanego wyszukiwania ogólnym pojedynczym modelem nie zachowuje źródeł i kosztów. Kontrakt całego wykonania pozwala później dołączyć OpenCode bez przepisywania domeny.

Punkty integracji w obecnym katalogu: [lib/companies/research.ts](../../../../../lib/companies/research.ts), [lib/companies/research-provider.ts](../../../../../lib/companies/research-provider.ts), [lib/companies/research-model.ts](../../../../../lib/companies/research-model.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Kontrakty i niezmienniki

ResearchExecutor.execute przyjmuje zapisane operationId/target/configuration i opcje signal/onAccounting; dokładna unia wyniku jest określona poniżej. target odpowiada istniejącemu ResearchTarget, configuration jest zapisaną migawką. draft jest niezwalidowanym JSON, a evidence ma typ ResearchEvidence[] z research-model.ts; brak dowodów nie jest pustym udanym raportem.

accounting zawiera usage poszczególnych kroków, identyfikatory odpowiedzi i znany koszt albo null. Błąd wykonawcy również niesie dostępne accounting zgodnie z poniższym wynikiem rozłącznym, aby nie zgubić kosztu pierwszego kroku. Nie przesyłać surowych odpowiedzi jako publicznych komunikatów błędu.

Wykonawca nie zapisuje firmy, raportu ani ai_attempts. Koordynator zawsze wywołuje validateResearch przed atomową publikacją i rozliczeniem próby. Publikacja sprawdza terminalny stan i blokuje ponowny efekt. OpenAI zachowuje dwa kroki oraz bieżący limit/cennik wyszukiwania; żadna reguła płatnego wykonawcy nie staje się globalnym limitem przyszłej Ollamy.

## Migracja i uruchomienie

Bez migracji, zmiany env i trasowania. researchConfiguration nadal rozpoznaje dotychczasowe modele. Stare rekordy recovery zachowują dotychczasową obsługę unknown. Nie dodajemy automatycznego researchu ani pogłębionego.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Atrapa OpenAI: te same dwa żądania, źródła, schemat i koszty.
2. Zły URL/cytat, brak źródeł, niekompletne tematy i odmowa.
3. Błąd drugiego kroku oraz nieznany koszt po pierwszym.
4. Integracja reuse/refresh, idempotencja komendy, restart i zachowanie poprzedniej wersji.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E04-AC01 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E04-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E04-AC03 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E04-AC04 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Gotowość i kontrola zmian

Kontrakt accounting określono poniżej; szczegóły ekstrakcji i zachowania dotychczasowego rozliczenia doprecyzowuje przegląd z 2026-11-05. Brak otwartej decyzji produktowej.

Przed kodem odświeżyć stan roboczy i zależności Beads. Przegląd specyfikacji wykonano 2026-11-05; nie zastępuje wyników testów ani kontroli zmian powstałych po przeglądzie.

## Wynik i accounting — doprecyzowanie 2026-11-05

`ResearchExecutor.execute` zwraca unię: `{outcome:'completed', draft, evidence, accounting}` albo `{outcome:'failed'|'unknown'|'cancelled', error:{code,message}, accounting}`. Oczekiwane błędy transportu/dostawcy/formatu są wynikiem, nie wyjątkiem tracącym accounting. Nie zwracamy pozornego pustego raportu. Niespodziewany błąd programistyczny nie jest sukcesem ani potwierdzeniem zerowego kosztu; koordynator zachowuje dziennik wykonania i oznacza niepewne rozliczenie.

`accounting` zawiera uporządkowane kroki wykonane do chwili sukcesu/błędu, response ID lub null, usage z null dla nieznanych pomiarów oraz koszt kroku jako dziesiętny string PLN lub null. Łączny koszt jest znany tylko gdy wszystkie wykonane płatne kroki mają znany pomiar; w przeciwnym razie null. Dla OpenAI zachować dotychczasowe zagregowane zaokrąglenia, określone w przeglądzie poniżej. Brak drugiego kroku po błędzie pierwszego nie tworzy fikcyjnej opłaty. Błąd syntezy nie usuwa znanego kosztu wyszukiwania. Dla lokalnego modelu koszt API zawsze '0', także gdy usage lub wynik są nieznane; ewentualne płatne narzędzia są osobnymi krokami. W etapie4 zachować dotychczasowe reguły OpenAI.

Dziennik prób i publikację zapisuje koordynator; adapter nie mutuje ai_attempts. Test E04-AC03 sprawdza: pierwszy krok płatny zakończony, drugi błąd/utrata odpowiedzi, brak utraty znanej części kosztu i brak publikacji.

## Przegląd i kontrakt wykonawczy — 2026-11-05

Przejrzano `runResearch` w research-provider.ts, executeCompanyResearch w research.ts i validateResearch w research-model.ts. Dzisiaj wykonawca zwraca już raport po walidacji; wydzielenie musi przenieść ostateczną walidację do koordynatora, zachowując oba żądania i kontrolę dowodów. Wykonawca nie publikuje raportu.

`ResearchExecutor.execute({operationId,target,configuration},{signal,onAccounting})` zwraca opisaną wyżej unię. Dla completed draft jest niezwalidowanym JSON (unknown), evidence ma ResearchEvidence[]. Domena posiada researchDraft i validateResearch, wykonawca nie wymusza deklaracji poprawnego draftu przed walidacją. W etapie 8 dodatkowy kontekst wykonania/sesji obsługuje adapter OpenCode, bez wtłaczania go do StructuredModel.

Każdy krok accounting: `{step:'search'|'synthesis',requestId:UUID,status:'prepared'|'sent'|'completed'|'failed'|'unknown',responseId:string|null,usage:{inputTokens:number|null,outputTokens:number|null,searchCalls:number|null},knownCostPln:string|null}`. Kolejność odpowiada rzeczywistym wywołaniom. Nie tworzyć kroku syntezy, jeżeli nie rozpoczęto jego przygotowania. Znany koszt wyszukiwania pozostaje zachowany, nawet jeśli drugie żądanie ma niepewny koszt. Łączny `costPln:string|null` jest polem rozliczenia; null nie zeruje znanej części.

**Zgodność arytmetyki OpenAI:** rozliczenie całości zachowuje obecną funkcję runResearch: sumy tokenów obu kroków, specjalny blok 8000 tokenów per search dla gpt-4.1-mini, searchFee i dotychczasowe zaokrąglenia. Nie sumować niezależnie zaokrąglonych kosztów kroków zamiast obecnej kalkulacji zagregowanej. Wcześniejsze ogólne zdanie o sumie kosztów należy czytać z tą regułą dla legacy OpenAI. Każdy wykonany płatny krok bez potwierdzonego pomiaru daje costPln=null i zachowanie rezerwacji; znane pomiary kroków pozostają w usage. Zachować max_tool_calls=3, format źródeł, dwa requesty i płatne timeouty 120 s; nie rozszerzać tych ograniczeń na lokalnego agenta.

`onAccounting` jest wewnętrznym punktem kontrolnym, nie uprawnieniem adaptera do bazy: koordynator zapisuje dziennik w istniejącym ai_attempts.usage (dotychczasowe pola agregatu plus `execution_steps` z wersją 1). Callback jest oczekiwany przed wysłaniem żądania i po zebraniu metadanych odpowiedzi, przed kolejnym krokiem. Błąd checkpointu przerywa wykonanie, bez kolejnego płatnego HTTP. Aktualizacja pod identyfikatorem próby, bez zmiany końcowego stanu i bez przedwczesnego zwolnienia rezerwacji. Na awarię po wysłaniu, przed checkpointem odpowiedzi, recovery zachowuje unknown; nie odtwarza wywołania. To rozszerzenie JSON, bez migracji tabel i bez przepisywania starej historii.

Koordynator otrzymuje wykonawcę jako zależność; istniejący publiczny punkt wykonania może zachować fetcher jako fasadę zgodności. completed jest walidowane, dopiero potem pod blokadą operacji zapis raportu i ai_attempts. Walidacja odrzuca raport, ale nie kasuje accounting. Oczekiwane błędy to wynik failed/unknown/cancelled z bezpiecznym kodem; nieoczekiwany wyjątek zapisuje bezpieczny błąd i ostatni checkpoint, zachowuje niepewny koszt i brak publikacji. Identyfikatory odpowiedzi zachować w kolejności, również gdy nie ma raportu; zgodność dotychczasowego response_id i usage zostaje utrzymana.

Regresje: `tests/company-research.test.ts`, `tests/company-research.integration.test.ts` i istniejące fixtures. E04-AC01: reuse/refresh/command ID; AC02: brak topics/findings, cudzy dowód i cytat, walidacja po powrocie wykonawcy; AC03: znany koszt search + błąd/unknown syntezy, zgodność rounding całej próby, crash/checkpoint i brak drugiego HTTP po błędzie zapisu; AC04: restart/duplikaty i poprzedni raport. Testować przez ResearchExecutor oraz kontrakt HTTP, bez osobnego publicznego interfejsu sztucznego search provider.
