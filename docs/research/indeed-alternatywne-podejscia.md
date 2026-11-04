# Indeed: alternatywne podejścia po HTML 403

Data: 2026-11-03. Uzupełnienie [wcześniejszego przeglądu forków](jobspy-forki-indeed.md). Wyłącznie odczyt publicznego kodu, GitHub API i publicznego artefaktu JSON; **zero żądań do Indeed**, zero uruchamiania pobranego kodu, zmian produkcyjnych lub zakupu proxy.

## Wniosek praktyczny

Najlepszy następny eksperyment to **jedno kontrolowane zapytanie mobilnego GraphQL dla Polski z limitem 5 wyników, bez filtrów seniority/remote/dat i bez automatycznych retry**, z zachowaniem statusu HTTP i ewentualnego błędu GraphQL. Nie ma podstaw, by utożsamiać dowiedzione lokalnie HTML 403 z awarią `apis.indeed.com/graphql`: dotychczasowy błąd GraphQL nie ma tutaj sklasyfikowanej odpowiedzi. Jeżeli wynik polski będzie niejednoznaczny, dopiero wtedy rozważyć osobny kontrolny wariant USA/San Francisco odpowiadający zewnętrznemu testowi. Limit obejmuje start **każdego fizycznego żądania co najmniej 1 s po poprzednim**, również przekierowania; na 403/429 przerwać dany przebieg.

Najmocniejsze nowe świadectwo to **alpharomercoma/ts-jobspy**, pochodna TypeScript python-jobspy, nie kolejny fork Python: publiczny automatyczny test z **2026-11-02** raportuje Indeed `status: ok`, **5 ogłoszeń, 5 opisów**, 5 dat publikacji, 4 nazwy firm. To dowód konkretnego testu autora dla USA na GitHub Actions, nie naszego IP, Polski ani kompletności całego źródła. [Run](https://github.com/alpharomercoma/ts-jobspy/actions/runs/41478532464).

## Co dokładnie potwierdzono w ts-jobspy

Zbadany commit i `head_sha` pomyślnego uruchomienia: `529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a`.

- Endpoint pozostaje `https://apis.indeed.com/graphql`; klient to Axios/Node, nie pełna przeglądarka. Zapytanie pobiera opis w tej samej odpowiedzi, więc nie potrzebuje `/viewjob` dla każdego ogłoszenia. [Implementacja](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/src/indeed/index.ts).
- Nagłówki mają konkretny mobilny UA `Indeed App 193.1`, `indeed-app-info`, współdzielony klucz i `indeed-locale: en-US`; osobno dopisywany jest `indeed-co`. Komentarz autora mówi, że zmiana na dowolny UA powoduje 403. **Kod potwierdza wysłanie tych nagłówków; komentarz nie stanowi samodzielnego dowodu konieczności każdego z nich.** [Stałe i query](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/src/indeed/constant.ts).
- README deklaruje test z IP domowego 2026-08-31; to deklaracja autora. Silniejsze, świeższe świadectwo daje odczytany raport z CI, bez konfiguracji proxy w workflow. Nie wynika z tego, że każde IP będzie działać. [README](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/README.md), [workflow](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/.github/workflows/scrape-health.yml).

### Sprawdzenie zielonego CI i raportu

Skrypt rzeczywiście woła scraper z `searchTerm='software engineer'`, `location='San Francisco, CA'`, `resultsWanted=5`, `country='usa'`. Plik oczekiwań wymaga działania Indeed. Skrypt kończy się błędem przy regresji, ale uznaje również `partial` za działający stan; **samo zielone CI nie dowodzi pełnego sukcesu**. Dlatego odczytano artefakt: raport zawiera `ok`, nie `partial`, `received: 5`, `description: 5`, czas 0,392 s, datę `2026-11-02T16:08:45.603Z`. Nie zawiera surowych ofert, więc nie pozwala niezależnie sprawdzić ich trafności lub świeżości. [Skrypt](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/scripts/scrape-health.mjs), [oczekiwania](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/scripts/scrape-health.expected.json).

Odtworzenie **odczytu dowodu, bez kontaktu z Indeed**: GitHub API `GET /repos/alpharomercoma/ts-jobspy/actions/runs/41478532464` zwraca SHA powyżej; `GET /repos/alpharomercoma/ts-jobspy/actions/runs/41478532464/artifacts` wskazuje artefakt `13157374511`, nazwę `scrape-health-41478532464`, `expired=false`; pobrano jego ZIP przez `/repos/alpharomercoma/ts-jobspy/actions/artifacts/13157374511/zip` i odczytano JSON. Artefakt jest czasowy, a link do run pozostaje punktem wejścia. Pozostałe cztery najnowsze odczytane runy z 2026-10-29–11-01 również mają `success`, lecz ich artefaktów nie sprawdzano.

## Różnice wobec lokalnego GraphQL

Porównano bez wykonywania kodu `.local/JobSpy/jobspy/indeed/{__init__,constant}.py`.

| Element | Lokalny JobSpy | ts-jobspy | Znaczenie |
|---|---|---|---|
| Endpoint, klucz, app UA, app-info | Mobilny GraphQL, Indeed App 193.1 | To samo | Nie jest to nowy endpoint ani odkrycie brakującego UA |
| Kraj i język | `indeed-co: PL`, `indeed-locale: pl-PL` dla Polski | `indeed-co` zależne od kraju; locale zawsze en-US | Rzeczywista zmienna do osobnego testu, bez dowodu, że polskie locale jest błędem |
| Rozmiar strony | 100 | Minimum ze 100 i żądanej liczby+offset | Diagnostyka 5 wyników zmniejsza odpowiedź |
| Query | `dateOnIndeed`, `sourceEmployerName`, `ugcStats`, zakresy Range/AtLeast/AtMost/Exactly | Starsza, inna selekcja m.in. `datePublished`, `attributes.label`, dodatkowe pola dossier | HTTP 200 z błędem schematu wymaga innej diagnozy niż HTTP 403 |
| Transport | Requests przy kontrolowanym GraphQL | Axios i TLS Node | Możliwa osobna zmienna, brak dowodu przewagi na naszym IP |
| Filtry | Łączone grupy | Jedna grupa według priorytetu | Pierwsza próba powinna nie mieć filtrów, aby nie mieszać przyczyn |

Należy sprawdzić również rzeczywisty parametr `user_agent` wywołania: lokalna funkcja tworzenia sesji może nadpisać stałe. Sam fakt obecności poprawnych stałych w pliku nie dowodzi ich wysłania w dawnym przebiegu. Rekomendacja nie zakłada, że dawniej nadpisanie wystąpiło.

## Przeglądarki, cookies, proxy i alternatywne adresy

W zbadanej próbce **nie znaleziono zweryfikowanej implementacji Indeed w forku JobSpy**, która dodaje utrwaloną sesję przeglądarki/import cookies i świeży, odtwarzalny dowód działania. To ograniczony wynik wyszukiwania, nie twierdzenie o wszystkich forkach.

- Upstream [#125](https://github.com/speedyapply/JobSpy/issues/125) zawiera deklarację użytkownika, że Selenium pobiera aktualniejsze ogłoszenia, ale wolniej; nie przedstawia kodu Selenium ani świeżego testu Polski. To trop, nie gotowa poprawka.
- Trafienia Playwright w `elucidator8918/JobSpy` dotyczyły innych portali; odczyt `blongstaff30/JobSpy/jobspy/__init__.py` pokazał eksport Playwright dla portali półprzewodnikowych, podczas gdy Indeed pozostaje osobną klasą. Sama obecność zależności Playwright w repo nie jest naprawą Indeed. [Kod blongstaff](https://github.com/blongstaff30/JobSpy/blob/04eb12074f865950f292f317c59c24e7b8ba4352/jobspy/__init__.py).
- `rohil01/JobSpy` ma znany już mobilny GraphQL jako fallback po HTML. Jego docstring deklaruje dawny sukces z 2026-07-27 i ostrzega o nietrwałości współdzielonego klucza; nie jest to inne API lub świeży dowód. [Kod](https://github.com/rohil01/JobSpy/blob/fc3c3cd81f7eca513d249bf6cc5612e9a19cd480/src/jobsniffer/indeed/graphql.py).
- Nie znaleziono w tych wyszukiwaniach konkretnego, popartego kodem i aktualnym wynikiem wariantu Indeed RSS ani `m.indeed.com` dla JobSpy. `apis.indeed.com/graphql` **już jest mobilnym wariantem**, a nie alternatywą wymagającą znalezienia kolejnej domeny. Historyczne pytanie o pochodzenie API: [#221](https://github.com/speedyapply/JobSpy/issues/221).
- Proxy jest wspierane przez projekty, ale udany odczytany workflow ts-jobspy nie przekazuje proxy. Nie ma tu dowodu, że trzeba zacząć od zakupu residential proxy. README jest zaleceniem autora, nie porównaniem kontrolowanym przy tym samym IP.

Pełna przeglądarka to dopiero drugi kierunek, jeżeli kontrolowany GraphQL zawiedzie, a ręczna sesja ma dostęp do HTML. Trzeba wówczas zapewnić jedną globalną bramkę dla nawigacji, skryptów, zasobów, XHR, service workerów i przekierowań. Sekunda między nawigacjami sama nie zapewnia limitu 1 fizycznego żądania/s. Import cookies jest hipotezą do osobnego eksperymentu, nie rozwiązaniem potwierdzonym tym badaniem.

## Granice próbki

Nie powtarzano audytu 117 metadanych forków z wcześniejszej notatki. Obecne badanie obejmuje kod Indeed, stałe, README, workflow, skrypt i oczekiwania **jednej pochodnej ts-jobspy**, metadane 5 runów i 1 rzeczywisty artefakt; dodatkowo kod GraphQL rohil01 oraz odczyt trafień blongstaff/firstmate. Pierwsza próba GitHub API bez dostępu sieciowego nie powiodła się; dalsze odczyty publiczne wykonano przez autoryzowany dostęp sieciowy.

W GitHub Search API sprawdzono pojedyncze strony (maks. 30 lub 50 wyników), bez enumeracji wszystkich forków: upstream `indeed cookie` (5), `indeed playwright` (1), `indeed selenium` (1), `indeed rss` (0), `indeed mobile` (2), `indeed browser` (2). Wyniki obejmują także dopasowania w komentarzach i tematy innych portali, więc liczby nie oznaczają tylu rozwiązań Indeed. Wyszukiwanie kodu z `fork:true`: `selenium path:jobspy/indeed` (0), `playwright path:jobspy/indeed` (0), `cookies path:jobspy/indeed` (0), `browser_cookie3 JobSpy` (0), `"m.indeed.com" JobSpy` (0), `cf_clearance JobSpy` (1, dotyczyło hiring.cafe), `playwright filename:__init__.py JobSpy` (5, brak potwierdzenia Indeed), `"/rss" indeed JobSpy` (20, brak zweryfikowanego wariantu w tej próbce). Globalne `indeed playwright filename:indeed.py fork:true` zwróciło 38 plików, z których odczytano tylko metadane pierwszych 30; nie stanowią audytu kodu ani forków JobSpy. Do tego trzy zapytania internetowe ograniczone do GitHub stanowiły odkrywanie źródeł, nie dowód skuteczności.

GitHub Search zależy od indeksowania i nie obejmuje każdej gałęzi, pliku ani prywatnego repozytorium. Żadnego z opisanych podejść nie przetestowano tutaj lokalnie na Indeed. Nie ustalono liczby trafnych ogłoszeń senior PHP dostępnych z Polski.

## Kryterium następnego eksperymentu

Zapisać odrębnie HTTP status, typ treści, czas, liczbę fizycznych żądań, `errors` GraphQL, obecność `data.jobSearch.results` i liczbę wyników. HTTP 200 samo nie wystarcza. Sukces 5 ogłoszeń potwierdzi dostępność próby, nie pełną synchronizację źródła. Jeśli wystąpi blokada lub błąd, nie traktować tego jako zera ofert ani wygaśnięcia ogłoszeń źródłowych. Dopiero rozpoznany typ błędu uzasadni próbę jednej kolejnej zmiennej: starszej selekcji pól, locale en-US, transportu Node lub sesji przeglądarki.
