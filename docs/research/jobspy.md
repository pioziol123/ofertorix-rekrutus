# JobSpy — ocena biblioteki i dopasowania do projektu

Data odczytu: **2026-11-02**. Badany [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy), pliki gałęzi `main`; odczytany `pyproject.toml` deklaruje **1.4.1**. Nie potwierdzono SHA tego zestawu plików: strony drzewa i historii GitHub zwracały starsze, wzajemnie niespójne widoki względem plików raw. Nie należy utożsamiać tej analizy z konkretnym wydaniem PyPI ani historycznym commitem. [Metadane pakietu](https://github.com/speedyapply/JobSpy/blob/main/pyproject.toml).

To analiza README i kodu, bez instalacji, uruchamiania scraperów ani prób dostępu do portali. „Obsługuje” oznacza obecność implementacji/deklaracji, a nie potwierdzoną dziś skuteczność pobierania. Raport jest materiałem badawczym, nie decyzją o dodaniu źródła.

## Ocena

**Wniosek:** JobSpy może skrócić eksperyment z dodatkowymi ogłoszeniami LinkedIn i Indeed, ale wymaga własnego adaptera, kontroli jakości i obsługi niepełnych wyników. Nie zastępuje istniejącego importera SOLID.Jobs. Największe problemy dla obecnego zakresu PHP Senior to wyszukiwanie tekstowe zamiast filtrów katalogowych, brak gwarancji kompletności oraz różnice między polskim modelem zatrudnienia a schematem biblioteki. Poniżej przesłanki i granice tej oceny.

## Co dostarcza

JobSpy to lokalna biblioteka Python do pobierania ogłoszeń z wielu portali i ujednolicania ich do tabeli Pandas. Nie jest bazą ofert prowadzoną przez operatora ani gotową aplikacją do zarządzania rekrutacją. README opisuje także CLI i serwer MCP oraz uprzedza o blokadach źródeł. [README](https://github.com/speedyapply/JobSpy#readme).

Pakiet wymaga Python ≥3.10; zależy od `requests`, BeautifulSoup, Pandas, Pydantic, `curl_cffi` i `markdownify`. Ma komendy `jobspy` i `mcp-jobspy`. To dodatkowy runtime względem naszego TypeScript/Node. [pyproject.toml](https://github.com/speedyapply/JobSpy/blob/main/pyproject.toml).

### Źródła i Polska

| Źródło | Stan deklarowany / widoczny w kodzie | Znaczenie dla tego projektu |
| --- | --- | --- |
| LinkedIn | Globalne wyszukiwanie przez `location`. | Kandydat na dodatkowe ogłoszenia dostępne z Polski; lokalizacja nie dowodzi prawa do pracy z Polski. |
| Indeed | Lista obsługiwanych krajów obejmuje `Poland`. | Najbardziej bezpośredni kandydat do eksperymentu na polskim rynku. |
| Glassdoor | Polska nie jest oznaczona jako obsługiwana w README i nie występuje w mapie domen. | Nie zakładać wsparcia `country_indeed="poland"` dla tego źródła. |
| ZipRecruiter | USA/Kanada. | Niewielka przydatność dla zakresu Polska. |
| Bayt / Naukri / BDJobs / HelloWork | Odpowiednio rynki bliskowschodnie, Indie, Bangladesz i Francja. | Obecność źródła nie oznacza pokrycia polskiego rynku. |
| Google Jobs | Implementacja nadal istnieje, lecz README mówi, że źródło jest niedostępne. | Nie planować go jako działającego źródła. |

Geografię deklaruje [README](https://github.com/speedyapply/JobSpy#supported-countries-for-job-searching); brak Polski potwierdza [mapa Glassdoor](https://github.com/speedyapply/JobSpy/blob/main/jobspy/glassdoor/constant.py). Biblioteka nie zawiera adapterów SOLID.Jobs, Just Join IT, No Fluff Jobs, Bulldogjob ani theprotocol.it — nie rozszerza automatycznie naszego pokrycia tych portali. [Mapa adapterów](https://github.com/speedyapply/JobSpy/blob/main/jobspy/__init__.py).

## Architektura i sieć

`scrape_jobs()` waliduje argumenty przez Pydantic, tworzy po jednym adapterze na portal i wykonuje adaptery równolegle przez `ThreadPoolExecutor`. Następnie spłaszcza ogłoszenia do DataFrame i sortuje po źródle i dacie. **Nie scala tej samej oferty między portalami.** Parametr `results_wanted` dotyczy każdego źródła osobno. Do tabeli dopina `attrs["errors"]` i `attrs["warnings"]` z adapterów. Nie dodaje trwałego magazynu, historii ani harmonogramu. [Orchestrator](https://github.com/speedyapply/JobSpy/blob/main/jobspy/__init__.py).

Ważna różnica wobec opisu „default is all”: domyślna lista funkcji bibliotecznej obejmuje wszystkie wartości `Site` **oprócz Google**. CLI ma jeszcze inny domyślny zestaw: Indeed, LinkedIn, ZipRecruiter, Glassdoor. Do integracji trzeba jawnie podać źródła. [Model wejścia](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py), [domyślne źródła CLI](https://github.com/speedyapply/JobSpy/blob/main/jobspy/records.py).

### LinkedIn

Adapter pobiera HTML anonimowego endpointu `jobs-guest/jobs/api/seeMoreJobPostings/search`, bez konta i OAuth. Przesyła frazę, lokalizację, odległość, filtr czasu, easy apply i opcjonalne identyfikatory firm. **Aktualny kod ignoruje `is_remote` i `job_type`, zapisując ostrzeżenie**. Deduplikuje identyfikatory w jednym przebiegu. Przerwy 3–7 sekund dotyczą kolejnych stron wyszukiwania; nie stanowią ogólnego ogranicznika każdego żądania. Błędy strony przerywają przebieg z dotychczasowymi wynikami. [Adapter LinkedIn](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/__init__.py).

`fetch_description=True` dodaje GET strony każdego ogłoszenia. Dopiero szczegóły dostarczają m.in. opis, seniority i rodzaj pracy. Błąd szczegółów może pozostawić ogłoszenie bez tych pól, jedynie z wpisem w logu. Parsowanie opiera się na konkretnych klasach HTML i angielskich nazwach kryteriów. **Wniosek:** zmiana strony lub jej języka może zmniejszyć kompletność bez utraty całego rekordu. [Kod szczegółów](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/__init__.py).

Stałe określają 10 kart na stronę i limit startu 1000. Parser płacy oczekuje charakterystycznego formatu; heurystyka opisu szuka dolarów, a nie polskich widełek PLN. [Stałe LinkedIn](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/constant.py).

### Indeed

Adapter wysyła POST GraphQL do `https://apis.indeed.com/graphql`, stronicuje kursorem, deduplikuje klucze ogłoszeń i pobiera opisy razem z wynikami. Obsługuje kraj/lokalizację, czas, typ pracy, remote i easy apply; remote wyklucza atrybut hybrid. Błąd sieci lub walidacji strony kończy pobieranie z częściowym wynikiem. [Adapter Indeed](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/__init__.py).

Kod ma zapisany w repo klucz w nagłówku `indeed-api-key` i nagłówki naśladujące aplikację Indeed na iOS. Zapytanie pobiera do 100 wpisów i sortuje po trafności. **Wniosek:** to zależność od interfejsu i stałych aplikacji portalu; obecność GraphQL nie jest dowodem oficjalnej, stabilnej umowy API dla naszej aplikacji. [Zapytanie i nagłówki](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/constant.py).

### Google

Pozostawiony adapter parsuje stronę `google.com/search` z `udm=8`, następnie wewnętrzny callback i zagnieżdżone struktury wyników. `google_search_term` nadpisuje budowaną frazę. Kod limituje liczbę do 900 i deduplikuje URL-e. **Wniosek:** obecność kodu i wartości enum nie potwierdza sprawności; negatywna deklaracja README ma znaczenie dla wyboru źródła. [Adapter Google](https://github.com/speedyapply/JobSpy/blob/main/jobspy/google/__init__.py).

### Proxy, logowanie i ponowienia

Wspólna warstwa rotuje przekazane proxy przy żądaniach; `localhost` oznacza połączenie bez proxy. Domyślny timeout to 15 s, można nadpisać User-Agent i plik CA. Dla części adapterów istnieje sesja `curl_cffi` z impersonacją Chrome; LinkedIn i Indeed używają `requests`. Nie znaleziono we wspólnej warstwie retry/backoff ani respektowania `Retry-After`. Poziomy logowania to errors / warnings / info. [Warstwa HTTP i logi](https://github.com/speedyapply/JobSpy/blob/main/jobspy/util.py).

**Wniosek dotyczący przepływu danych:** lokalny proces wysyła zapytania do wybranych portali. Użycie zewnętrznego proxy dodaje kolejną usługę do tego przepływu; JobSpy nie zapewnia ani nie finansuje proxy. Nie trzeba przesyłać CV, profilu zawodowego ani historii aplikacji. Nie badano osobno warunków dostawców proxy.

## Schemat danych i filtr PHP Senior

Model obejmuje identyfikator/źródło, URL źródłowy i docelowy, tytuł, firmę, lokalizację, datę, opis, typ pracy, remote, seniority, wynagrodzenie z walutą i okresem oraz dodatkowe informacje o firmie/umiejętnościach. Większość pól jest opcjonalna. Serializer zamienia lokalizację na tekst, a listy, np. `skills` i `job_type`, na tekst rozdzielony przecinkami. Nie jest to bezstratny transport obiektowego modelu domeny. [JobPost i serializer](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py).

Nie ma osobnych filtrów wejścia na technologie, seniority, wynagrodzenie, język pracy, uprawnienia geograficzne ani polskie UoP/B2B. `job_type="contract"` nie potwierdza B2B. Zapytanie tekstowe `Senior PHP` trzeba traktować jako wyszukanie kandydatów, a nie odpowiednik filtrów Developer/PHP/Senior SOLID.Jobs. Brakujące kryterium pozostaje niewiadomą. [ScraperInput](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py).

**Istotna pułapka płacowa:** Indeed wybiera pensję pracodawcy, a przy jej braku może użyć własnego oszacowania portalu. Funkcja zwraca same kwoty/walutę/okres bez oznaczenia tej różnicy. Wniosek: nie wolno traktować każdej kwoty jako widełek podanych przez pracodawcę; potrzebna jest poprawa adaptera lub zachowanie dowodu pochodzenia. [Ekstrakcja płacy Indeed](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/util.py). Także automatycznej annualizacji nie należy używać jako polskiego wynagrodzenia porównywalnego brutto/netto.

## Kompletność, jakość i utrzymanie

`errors`/`warnings` w `attrs` są użyteczne, ale **nie stanowią dowodu pełnej synchronizacji źródła**. Adaptery mogą pomijać pojedyncze błędne ogłoszenia lub nie pobrać szczegółów, używając zwykłego `log.warning`, poza listą `warnings`. LinkedIn przy pustej kolejnej stronie dopuszcza zarówno koniec wyników, jak i throttling. Własny importer musi zachować tę niepewność; nieobecność ogłoszenia nie dowodzi wygaśnięcia. [LinkedIn](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/__init__.py), [Indeed](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/__init__.py).

CLI zwraca kod 0 także po odpowiedzi bez ofert oraz gdy przynajmniej część źródeł odpowie. Kod 1 oznacza całkowite niepowodzenie przy pustym zbiorze. Sam exit code nie wystarczy do oceny każdego źródła. Domyślny stdout to wybrane pola JSONL; pełny eksport również nie przenosi metadanych `DataFrame.attrs`. [CLI](https://github.com/speedyapply/JobSpy/blob/main/jobspy/cli.py), [serializacja/eksport](https://github.com/speedyapply/JobSpy/blob/main/jobspy/records.py).

Potwierdzony workflow CI buduje i instaluje pakiety na Pythonie 3.10–3.14, sprawdza import/CLI/start MCP, uruchamia Ruff i strict mypy. W tym workflow nie ma testów parserów na fixture ani prób kontraktowych portali. Nie potwierdzono osobnego, kompleksowego zestawu testów funkcjonalnych. Nie uruchamiano CI i nie oceniano jego aktualnego wyniku. [CI](https://github.com/speedyapply/JobSpy/blob/main/.github/workflows/ci.yml).

**Ocena:** typowanie, walidacja i diagnostyka pomagają w integracji, lecz nie dają gwarancji odporności scraperów na zmiany portali. Wersji `main` nie należy aktualizować automatycznie w produkcji. W tym odczycie nie ustalono rytmu wydań, czasu reakcji maintainerów ani gwarancji wsparcia.

## Licencja i dostęp do danych

Kod jest na MIT: pozwala używać i modyfikować bibliotekę z zachowaniem informacji o autorze i licencji w kopiach/istotnych częściach. Jest dostarczany bez gwarancji. [LICENSE](https://github.com/speedyapply/JobSpy/blob/main/LICENSE).

**Granica ustaleń:** licencja biblioteki nie jest zgodą operatorów portali na systematyczne pobieranie, przechowywanie czy dalsze publikowanie ogłoszeń. Nie przeprowadzono tu osobnej analizy regulaminów LinkedIn/Indeed/Google. Techniczna możliwość anonimowego żądania lub rotacji proxy nie rozstrzyga warunków dozwolonego wykorzystania. Ten raport nie daje oceny prawnej ani potwierdzenia uprawnień do danych.

## Możliwa integracja z obecną aplikacją — propozycja

Obecny projekt ma oddzielny worker, pg-boss, PostgreSQL oraz wersjonowane `source_ads`/`source_ad_revisions` i statusy przebiegów. Utrzymuje jawny zakres PHP Senior w SOLID.Jobs. Te granice pozostają właściwe także przy eksperymencie z JobSpy. [Projekt pobierania](../specs/pierwsza-wersja/features/pobieranie/solution-design.md), [architektura](../specs/pierwsza-wersja/architecture.md).

Proponowany wariant, wymagający osobnej decyzji wdrożeniowej:

1. Worker Node zleca kontrolowany proces Python albo lokalny kontener z przypiętą wersją. Osobne zadanie dla jednego portalu i zakresu; jawne `site_name`, limit wyników i timeout całego procesu. Nuxt pozostaje interfejsem użytkownika.
2. Mały wrapper biblioteczny zwraca kopertę JSON: `schemaVersion`, źródło, parametry, wersję JobSpy, daty wykonania, ogłoszenia oraz **oddzielne errors/warnings i braki szczegółów**. Nie opierać protokołu wyłącznie na CLI/stdout lub kodzie wyjścia.
3. Adapter TypeScript waliduje kopertę i mapuje `source + external_id`, zapisuje rewizje i obserwacje idempotentnie. Wynik JobSpy oznaczyć jako znormalizowany payload, nie oryginalną odpowiedź portalu. Zachować pochodzenie kwot i reguł kwalifikacji.
4. Nie uznawać ograniczonego wyszukiwania po trafności za pełną synchronizację. Ustalić osobną semantykę „zakończono odczyt ustalonego zapytania” bez automatycznego oznaczania niewidzianych wpisów jako niedostępne. Błędy i częściowe wyniki zachować w istniejącym modelu przebiegów.
5. Przed dopuszczeniem źródła: sprawdzić warunki dostępu, przygotować fixture parserów i transportu, ustalić retry/limity oraz wykonać małą autoryzowaną próbę dla Polski/PHP Senior. Zmierzyć brak opisów, szacunki płacy, duplikaty i rzeczywiste dodatkowe oferty względem SOLID.Jobs.

**Rekomendacja badawcza:** jeśli dodajemy to narzędzie do planu, zacząć od jednego izolowanego eksperymentu Indeed Polska; LinkedIn ocenić jako następny. Zachować obecny działający import SOLID.Jobs i nie obiecywać pełnego pokrycia rynku na podstawie samej listy portali JobSpy.
