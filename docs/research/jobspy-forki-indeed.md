# JobSpy: forki, PR i blokady Indeed

Data badania: 2026-11-03. Research publicznego kodu i GitHub API; nie uruchamiano pobranego kodu ani prób pobierania ofert z Indeed. Stan lokalnego projektu przekazany do badania: HTML Indeed zwraca 403 także z Chrome User-Agent, a ścieżka GraphQL nie działa. To kontekst, nie ponowny pomiar w tym badaniu.

## Wniosek

Najbardziej konkretnym kandydatem do selektywnego wykorzystania jest **cspenn/jobsniffer**: rzeczywiście zastępuje `requests`/`tls_client` klientem `curl_cffi` z `impersonate="chrome"`, a Indeed obsługuje przez HTML wyszukiwania, szczegóły `/viewjob` i awaryjny GraphQL. Zmiana fingerprintu TLS jest czymś innym niż sama podmiana User-Agent. Kod potwierdza istnienie mechanizmu, ale nie dowodzi, że przełamie obecne 403 z naszego IP ani że działa dla polskich ofert senior PHP. [Commit transportu](https://github.com/cspenn/jobsniffer/commit/8f8b019c993cd5bf9538382bb7776644e9d0cdcf), [klient HTTP w zbadanym stanie](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/http/curl_client.py), [przebieg Indeed](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/__init__.py).

Nie znaleziono w opisanej próbce publicznej poprawki z wiarygodnym dowodem usunięcia **obecnego** problemu 403 dla Polski. Nie oznacza to, że taka poprawka nigdzie nie istnieje.

## Zakres i ograniczenia przeglądu

- Odczytano pierwsze 100 forków według liczby gwiazdek i pierwsze 100 najnowszych: 117 różnych repozytoriów. To metadane, nie audyt całego kodu 117 forków. Źródła: [API stars](https://api.github.com/repos/speedyapply/JobSpy/forks?sort=stargazers&per_page=100), [API newest](https://api.github.com/repos/speedyapply/JobSpy/forks?sort=newest&per_page=100).
- Wybrano 12 pierwszych według gwiazdek oraz 22 najnowsze; po usunięciu powtórzeń: 32 forki. Próba odczytu `jobspy/indeed/__init__.py` powiodła się dla 25 forków i upstream. W 20 forkach plik miał dokładnie ten sam Git blob SHA co upstream (`c1783d399e156e239b0b7f3e7f3f82de3deefd04`). To porównanie jednego pliku; nie wyklucza zmian transportu w innych plikach.
- W pięciu pozostałych dostępnych plikach: `0Darkn/JobSpy`, `jerrison/JobSpy`, `ashishpatel26/jobspy`, `WideSu/JobSpy`, `dantekelly/JobSpy` pozostawał endpoint `https://apis.indeed.com/graphql`; nie znaleziono w samym module mechanizmu rozwiązującego HTML 403. Pozostałe siedem odczytów nie dało pliku pod tą ścieżką, co nie oznacza braku implementacji.
- Dlatego dodatkowo sprawdzono rekurencyjne drzewa `cspenn/jobsniffer` oraz `rohil01/JobSpy`: oba mają `src/jobsniffer/indeed/{search,graphql,detail,parse}.py` i testy. Szczegółowo odczytano implementację i transport **cspenn**, a nie całe oba repozytoria. [Drzewo cspenn](https://github.com/cspenn/jobsniffer/tree/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer), [drzewo rohil](https://github.com/rohil01/JobSpy/tree/fc3c3cd81f7eca513d249bf6cc5612e9a19cd480/src/jobsniffer/indeed).
- Zapytania upstream zwróciły 93 zgłoszenia/PR dla `Indeed`, 21 dla `403`, 5 dla `cloudflare`; zbiory się pokrywają. Przejrzano tytuły i istotne treści, nie wszystkie komentarze wszystkich zgłoszeń. [Indeed](https://github.com/speedyapply/JobSpy/issues?q=Indeed), [403](https://github.com/speedyapply/JobSpy/issues?q=403), [Cloudflare](https://github.com/speedyapply/JobSpy/issues?q=cloudflare).

Daty i kolejność to dane zwrócone przez GitHub, a nie dodatkowo ustalona historia wdrożeń. Widoczne w API aktualizacje nie są dowodem aktualnej sprawności scrapera. Nie wykorzystano prywatnych forków ani komercyjnego katalogu scraperów.

## Kandydaci i jakość dowodów

| Kandydat | Co faktycznie zmienia | Znaczenie dla lokalnego problemu | Pewność |
|---|---|---|---|
| cspenn/jobsniffer, commit `8f8b019…` i zbadany stan `0dafb16…` | `curl_cffi`, Chrome TLS fingerprint, wspólny interfejs HTTP | Warto wydzielić jako eksperyment transportowy; jest to realna różnica względem Chrome UA w zwykłym kliencie | Wysoka dla treści kodu; brak dowodu skuteczności z naszym IP |
| cspenn HTML search + detail | Parsuje `mosaic-provider-jobcards`, pobiera pełną treść przez `/viewjob`; brak providera albo HTTP błąd oznacza blokadę | Parser i oddzielenie blokady od prawdziwego zera wyników są użyteczne; sam parser nie usuwa 403 | Wysoka dla kodu |
| cspenn GraphQL fallback | Po blokadzie pierwszej strony HTML wraca do starego GraphQL | Nie daje wyjścia, jeśli obie lokalne ścieżki już zawodzą | Wysoka dla przepływu; brak świeżego dowodu live |
| upstream PR #306 | Limiter z `threading.Lock`, `time.monotonic`, losowym odstępem, osobną instancją na sesję | Można wykorzystać ideę, ale nie kopiować jako gwarancji wszystkich HTTP ≤1/s | Wysoka po odczycie diffu; PR otwarty |
| upstream #403/#409 | Filtry, wynagrodzenie, godziny i przekazanie User-Agent | Poprawność danych i konfiguracji; brak dowodu naprawy blokady | Wysoka dla zakresu commitów |

Źródła tabeli: [search.py](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/search.py), [graphql.py](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/graphql.py), [PR #306, diff](https://github.com/speedyapply/JobSpy/pull/306/files), [commit #403](https://github.com/speedyapply/JobSpy/commit/ca1f50580032efabef42c152ee6ca48ae4dc2928), [commit #409](https://github.com/speedyapply/JobSpy/commit/655ec04663b798742704f1038262b631cd1988f2).

## Co obiecuje fork, a co potwierdza kod

`graphql.py` forka opisuje historyczne sprawdzenie zwracające HTTP 200 i rzeczywiste oferty oraz ostrzega, że współdzielone dane dostępowe nie mają gwarancji działania. Komentarz odsyła do planu z 2026-07-27. To deklaracja autora dotycząca wcześniejszej próby, a nie niezależne potwierdzenie działania 2026-11-03. Kod nadal korzysta z tego samego endpointu `apis.indeed.com/graphql`. [Źródło](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/graphql.py).

Przepływ HTML ma przydatne rozróżnienie: odpowiedź bez `mosaic-provider-jobcards` lub błąd HTTP daje `blocked=True`, natomiast obecny provider z pustą listą daje rzeczywiste zero wyników. Fallback GraphQL następuje po blokadzie pierwszej strony. Po blokadzie dalszej strony zbieranie HTML kończy się i może oddać dotychczas zebrane wyniki; dla naszego modelu trzeba to jawnie oznaczyć jako **niepełną synchronizację źródła**. Szczegóły oferty mają fallback do skrótu wyszukiwania, który wymaga osobnego oznaczenia kompletności treści. [SearchPageResult](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/search.py), [kolekcja stron i budowanie oferty](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/__init__.py).

W zgłoszeniu upstream #287 jeden użytkownik opisywał Cloudflare i przejście do płatnego API Apify, a utrzymujący później napisał, że Indeed działa u niego, sugerując problem sieci, proxy albo IP. To różne obserwacje i nie ma tam odtwarzalnej poprawki kodu. Historyczne #74 również ma odpowiedź utrzymującego, że jego test działa, z pytaniem o jakość IP. Takie komentarze nie dowodzą ani uniwersalnej awarii, ani rozwiązania naszej. [#287 użytkownik](https://github.com/speedyapply/JobSpy/issues/287#issuecomment-3447091632), [#287 utrzymujący](https://github.com/speedyapply/JobSpy/issues/287#issuecomment-5906557112), [#74](https://github.com/speedyapply/JobSpy/issues/74#issuecomment-1844209037).

## Warunek wszystkich HTTP ≤1/s

Żaden z dwóch kandydatów nie zapewnia samodzielnie wymaganego twardego limitu:

- **cspenn**: nie ma w kliencie globalnego odstępu; `stamina` ma domyślne `wait_initial=0.5`, maksymalnie trzy próby i własny backoff. Każda próba musi wejść do wspólnej bramki czasowej bezpośrednio przed `_session.request`. Trzeba też wyłączyć automatyczne przekierowania i wykonywać je jawnie przez tę samą bramkę; w przeciwnym razie wewnętrzne żądania libcurl pozostają poza kontrolą. To wniosek z poziomu umieszczenia retry i pojedynczego wywołania biblioteki. [Kod](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/http/curl_client.py).
- **PR #306**: limiter należy do każdej sesji i przechwytuje `RequestsRotating.request()`, podczas gdy `HTTPAdapter(max_retries=...)` może ponawiać żądania poniżej tego poziomu. Samo `rate_delay_min=1` nie kontroluje całego ruchu wielu sesji ani wszystkich retry/redirect. Wymagane są jedna współdzielona bramka, minimum 1 s między startami rzeczywistych żądań i kontrola każdego retry oraz przekierowania. [Diff i implementacja](https://github.com/speedyapply/JobSpy/pull/306/files), [wersja PR](https://github.com/itsmeknt/JobSpy/blob/6eb437a3c39b2f12a686436b8df51c235c2a311e/jobspy/util.py).

Jeśli użyć pełnej przeglądarki, limit musi obejmować również zasoby i automatyczne żądania przeglądarki; sama sekunda między nawigacjami nie spełnia warunku wszystkich HTTP. Dlatego klient HTTP z jawnymi redirectami jest łatwiejszy do rozliczenia. Jest to rekomendacja projektowa, nie wynik próby z Indeed.

## Rekomendacja dla polskich ofert senior PHP

1. Nie wymieniać całego JobSpy na losowy fork. Przy ewentualnej implementacji wydzielić eksperymentalny transport `curl_cffi` oparty na wskazanym commicie, zachowując lokalny parser i wspólny licznik ruchu. Nie pobierać ani nie wykonywać całego forka tylko dlatego, że ma nowszą datę.
2. Przed jakimkolwiek testem sieciowym zapewnić globalne ≤1/s dla wyszukiwania, szczegółów, retry i redirect oraz zatrzymanie na 403. Opóźnienie nie jest gwarancją usunięcia blokady.
3. Dopiero wtedy oceniać osobno: dostęp do wyszukiwania Polska/PHP, treść ogłoszeń źródłowych, seniority i dostępność pracy z Polski. W zbadanych materiałach nie ma potwierdzonego wyniku dla tego zakresu; liczba ofert z USA nie jest takim dowodem.
4. W razie 403 traktować przebieg jako nieudaną lub niepełną synchronizację. Nie uznawać blokady za zero ogłoszeń ani za ich wygaśnięcie. Nie wracać automatycznie wielokrotnie do GraphQL, skoro w lokalnym kontekście ten fallback również zawodzi.

Pewność rekomendacji: wysoka, że wskazany fork wnosi konkretną zmianę transportu; umiarkowana, że zasługuje ona na ograniczony eksperyment; nieustalona dla faktycznej skuteczności wobec obecnej blokady Indeed w tej lokalizacji.
