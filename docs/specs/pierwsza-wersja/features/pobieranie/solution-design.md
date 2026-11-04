# Pobieranie i synchronizacja ofert — projekt rozwiązania

Status: **projekt zrealizowanego etapu**, 2026-10-31. Uzasadnienie: [requirements](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-04/AC-04, R-05/AC-05, R-06/AC-06, R-07/AC-07. Realizację właściciel zlecił po zawężeniu zakresu do PHP Senior. Poniżej projekt tego etapu oraz doprecyzowanie wykonania.

## Zakres oraz punkt wyjścia

**Potwierdzone:** kolejność setup → pobieranie → lista. Na tym etapie nie budujemy UI, ratingu, profilu ani researchu. Bieżący zakres: wyłącznie PHP, poziom Senior według filtrów SOLID.Jobs. Staff, Vue.js i agenci AI odłożeni poza ten etap.

Istniejący setup zapewnia PostgreSQL, migracje `node-pg-migrate`, `lib/db.ts` z pulą połączeń, `lib/queue.ts` z pg-boss, oddzielny `worker/index.ts` i testy Vitest. Worker obsługuje kolejkę techniczną oraz kolejkę importu. Ten etap rozszerza te elementy, zachowując działanie testu setupu.

Import i status obsługujemy CLI w kontenerze `tools`, wykonanie w `worker`. Na etapie importu nie dodano endpointów danych. Kolejny etap listy udostępnia je lokalnie bez logowania zgodnie z późniejszą decyzją właściciela.

## Kontrakt źródła i ograniczenia

Ponownie odczytane 2026-10-31: [strona API](https://solid.jobs/api-ofert-pracy), [klient operatora](https://github.com/solid-company/solid-jobs-client), [słownik](https://raw.githubusercontent.com/solid-company/solid-jobs-client/main/DICTIONARIES.md). API używa campaign, paginacji od 0, nagłówka wersji i identyfikatora jobOfferKey. PHP ma podkategorię źródłową. Po zawężeniu zakresu do samego Senior używamy bezpośrednio filtra poziomu Senior; nie implementujemy lokalnego rozpoznawania Staff. Filtr minimalnej płacy operatora sprawdza dolną granicę, więc nie odpowiada naszej regule częściowo pasujących widełek. Nie wykorzystujemy go w tym imporcie.

Adapter użyje natywnego fetch Node, bez nowego SDK. Konfiguracja: `campaign=oferty-pracy-local`, `X-Api-Version: 1.0`, `pageSize=100`, sortowanie `validFrom asc`; strony sekwencyjnie, co najmniej sekunda między żądaniami, timeout 30 s. Jedno automatyczne ponowienie błędu przejściowego, z uwzględnieniem Retry-After i ograniczonym czasem oczekiwania. Po drugim błędzie przebieg jest niepełny lub nieudany, z jawną przyczyną.

API nie zapewnia potwierdzonego atomowego snapshotu wielostronicowego. Ukończony przebieg jest obserwacją naszego importera, nie dowodem zakończenia rekrutacji ani niezmienności portalu w trakcie odczytu.

## Zakres specjalizacji i kwalifikacja

**Potwierdzone przez właściciela:** tylko PHP, poziom Senior.

Odczyt działu IT z `search.categories=Developer`, `search.subCategories=PHP` i `search.experiences=Senior`. Zakres jest katalogowy: odpowiada oznaczeniom źródła, bez obietnicy odnalezienia ról PHP/Senior skategoryzowanych w innych działach lub poziomach. Nie odczytujemy całego IT ani nie uruchamiamy wyszukiwania Staff, Vue i agentów AI. Nie potrzebujemy klasyfikacji tekstowej seniority dla tego etapu.

Parametry odczytu i ich fingerprint są zapisane przy przebiegu. Braki innych danych, np. widełek, nie wykluczają pobranego wpisu. Nieznane lub rozbieżne wartości z odpowiedzi zachowujemy bez imputacji, ze wskazaniem źródła. Zmiana filtrów nie stanowi dowodu niedostępności wcześniej pobranych ogłoszeń.

## Minimalny model zapisu

Nowa migracja SQL w istniejącym mechanizmie, bez ORM. Tabele są własnością modułu źródeł, a nie modelem całego produktu.

| Tabela | Kontrakt |
| --- | --- |
| source_scopes | UUID, source, kanoniczne parametry odczytu JSONB, wersja reguł kwalifikacji, fingerprint zakresu. Nie zawiera sekretów. |
| source_sync_runs | UUID, scope_id, trigger manual/scheduled, status queued/running/complete/partial/failed, start/koniec, liczniki stron/wpisów/zmian, bezpieczny błąd. Poprzedni pełny przebieg pozostaje wskazywalny po awarii. |
| source_ads | UUID, source/external_id unikalne, URL, pierwsze/ostatnie wykrycie, bieżąca wersja, kwalifikacja i dowody, dostępność, dane wygaśnięcia. Bez tworzenia na razie Organization i procesu Application. |
| source_ad_revisions | UUID, source_ad_id, hash stabilnej treści/pól, surowy payload JSONB i data odczytu; identyczny stan nie tworzy kolejnej rewizji. |
| source_run_seen | run_id + source_ad_id unikalne: obserwacja wpisu w przebiegu, niezależna od dopasowania profilu. |

Opcjonalne dane zachowują brak/null zgodnie ze źródłem; nie imputujemy wynagrodzeń, kraju pracy, roli firmy ani brakujących technologii. Nierozpoznane wartości enum pozostają w payloadzie, zamiast powodować utratę całej strony. Brak stabilnego klucza lub niepoprawna koperta paginacji uniemożliwia uznanie przebiegu za pełny.

Surowe HTML zapisujemy jako dane; nie wykonujemy go i nie dodajemy teraz renderera. W następnym etapie lista musi użyć bezpiecznej prezentacji. Zachowane wersje nie są jeszcze obowiązkiem budowania widoku dawnych treści.

## Wykonanie i współbieżność

1. CLI waliduje konfigurację, tworzy przebieg i zleca zadanie przez istniejący pg-boss. Zapis i wysłanie muszą być jedną transakcją na tym samym kliencie SQL; adapter transakcyjny będzie sprawdzony testem rollback.
2. Worker uzyskuje dedykowaną blokadę dla źródła/zakresu; nie utrzymuje transakcji podczas sieci. Równoczesne zlecenie wskazuje już aktywny przebieg zamiast pobierać ten sam zakres drugi raz.
3. Każda poprawna strona zapisywana atomowo: upsert, ewentualna rewizja, obserwacje i liczniki. Niepowodzenie później nie usuwa poprawnych stron.
4. Pełność wymaga kompletu poprawnych stron, zgodnych metadanych i braku wykrytych duplikatów/luk wskazujących na niestabilny zestaw. Widoczna zmiana liczników lub paginacji daje partial; nie oznaczamy wtedy zniknięć.
5. Po pełnym porównywalnym przebiegu można oznaczyć brak obserwacji jako niedostępność. Wygaśnięcie wynika z daty źródła. Oba stany nie oznaczają zakończenia rekrutacji.
6. Status i wynik są trwale zapisane, niezależnie od historii technicznej kolejki. Powrót wpisu przywraca dostępność, nie tworzy drugiej oferty źródłowej.

Odzyskanie po awarii wymaga testowalnego kontraktu: blokada dedykowanego połączenia znika po utracie procesu; worker przy starcie/okresowym sprawdzeniu oznacza porzucony running jako partial/failed wyłącznie po potwierdzeniu braku aktywnej blokady. Kolejne zlecenie nie może bezterminowo zwracać martwego przebiegu. Ponowienie zaczyna od strony 0, zachowując idempotencję i poprzednią historię. Techniczne ponowne dostarczenie nie resetuje limitu automatycznych prób.

## Komendy i harmonogram

Skrypty pakietu:

- `pnpm source:sync` — waliduje zakres, zleca przebieg i wypisuje jego id; opcjonalnie czeka na wynik do ograniczonego czasu.
- `pnpm source:status [run-id]` — stan, liczniki, błąd i ostatnia pełna synchronizacja.

Przykładowe wykonanie przez `docker compose run --rm tools ...`. Po restarcie workera nowe moduły muszą zostać uruchomione; istniejący smoke nadal działa.

Harmonogram raz dziennie w Europe/Warsaw, godzina w konfiguracji. Na starcie i okresowo sprawdzamy zaległość, po przerwie tworzymy jeden przebieg, bez odtwarzania każdego dnia. Jedno źródło i mały wolumen pozwalają nie dodawać nowego serwisu harmonogramu. Brak poprawnej konfiguracji nie uruchamia ukradkiem pełnego importu IT; status wyjaśnia, czego brakuje.

## Weryfikacja i pokrycie

| Wymaganie | Metoda i dowód |
| --- | --- |
| R-04 / AC-04 | Fixture wielostronicowe i ograniczona próba rzeczywistego API; zgodne identyfikatory/URL/payloady. Powtórny import: brak duplikatów i zbędnych rewizji. Test zapytania potwierdza filtry Developer/PHP/Senior oraz zachowanie niekompletnych danych odpowiedzi bez dopisywania wartości. |
| R-05 / AC-05 | Sterowany czas Europe/Warsaw, kilka opuszczonych dni, start i okresowe sprawdzenie; dokładnie jedno zlecenie zaległości. Dwa CLI jednocześnie bez równoległego importu. |
| R-06 / AC-06 | Błąd po zapisanych stronach, 429 i drugi błąd, niepoprawne dane; zachowane poprawne strony, niezmieniona data last full, brak fałszywych zniknięć. Kill workera i ponowienie bez martwej blokady. |
| R-07 / AC-07 | Brak/powrót wpisu, jawna data wygaśnięcia, zmiana zakresu i niestabilne strony; różne stany dostępności, brak usuwania historii. |
| Integracja setupu | Migracja nowej/poprzednio utworzonej bazy, rollback danych+zadania, nadal przechodzące testy technicznej kolejki, lint/typecheck/build. Brak połączeń AI i nowych endpointów danych. |

Weryfikację realizują testy Vitest adaptera i integracji PostgreSQL/pg-boss, przygotowane z osobnym testerem. Wyniki końcowe odnotowane w zadaniu Beads oferty-pracy-5zq.

## Doprecyzowanie implementacji

PHP i Senior są potwierdzone, z bezpośrednim mapowaniem filtrów źródła. Domyślnie 08:00 Europe/Warsaw, zmiana przez SOURCE_SYNC_TIME. Zapisany schedule_day oznacza ostatni należny termin; ręczny import pokrywa ten termin. Nieudany przebieg nie wywołuje kolejnych automatycznych przebiegów tego samego dnia. Ponowienie błędu przejściowego odbywa się raz na poziomie żądania HTTP; kolejka nie ponawia całego importu automatycznie.

Zakres i reguła są dowodem kwalifikacji, powiązanym z ogłoszeniem przez ostatni scope i obserwacje przebiegów; nie dodano oddzielnej kolumny qualification. Rozbieżne/brakujące pola zostają w surowym payloadzie. valid_to przechowuje datę źródła niezależnie od availability; nie utrwalamy zmiennego w czasie bool expired. Hash porównujemy z bieżącą rewizją, więc powrót wcześniejszej treści jest nową rewizją historii.

Blokada sesyjna serializuje wykonanie źródła, oddzielna blokada transakcyjna serializuje zlecenia. Atomowe send korzysta z pg-boss db.executeSql na tym samym kliencie PostgreSQL. Status queued po przerwaniu dostarczenia jest odzyskiwany po stwierdzeniu końca/braku zadania; aktywne dostarczenie może wymagać oczekiwania na wygaśnięcie kolejki (do godziny). CLI nie uznaje przekroczenia czasu oczekiwania za anulowanie importu.

API: sortActive (nie sortBy). Próba rzeczywistego API 2026-10-31 i pierwszy pełny zapis: 31 ogłoszeń, wszystkie Developer/PHP/Senior. Kolejny etap to lista; dane nie są jeszcze wystawiane przez HTTP.
