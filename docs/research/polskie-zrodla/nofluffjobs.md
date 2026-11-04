# No Fluff Jobs — dostęp do ogłoszeń

Data weryfikacji: **2026-11-03**. Uzupełnienie [wcześniejszego porównania źródeł](../zrodla-ofert.md). Badano publiczne strony i dokumenty operatora, publiczny kod niezależnych integracji oraz pojedynczą odpowiedź szczegółów w przeglądarce, bez pobierania bazy, uruchamiania scraperów, obchodzenia zabezpieczeń ani kontaktu z operatorem. Wyniki wyszukiwarek mogą być opóźnione i strony ogłoszeń mogą się zmienić.

## Wniosek

**Portal zawiera ogłoszenia i rozbudowaną wyszukiwarkę, ale droga do automatycznej integracji pozostaje nieuzgodniona.** PHP i Senior są jedynie przykładami, a technologie i wartości filtrów projektu pozostają konfigurowalne. Nie znaleziono oficjalnie udokumentowanego publicznego API odczytu ogłoszeń ani oficjalnego kanału RSS ofert. Nie jest to dowód, że żaden taki dostęp nie istnieje lub że nie da się go uzyskać indywidualnie. Przeglądarkowa wyszukiwarka i jej ewentualne techniczne zaplecze nie stanowią udokumentowanego kontraktu integracyjnego.

Regulamin z 15.10.2026, § 2 ust. 8–9, ogranicza pobieranie lub wtórne wykorzystanie istotnej części bazy, a także powtarzające się lub systematyczne pobieranie danych tworzących bazę, w szczególności ogłoszeń. Dlatego **przed zaplanowaniem cyklicznego importu także na użytek osobisty należy uzyskać od operatora odpowiednie uzgodnienie na piśmie**, obejmujące konkretny sposób użycia. Jest to praktyczny wniosek dla projektu, nie opinia prawna. [Regulamin, s. 7](https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf#page=7).

## Co widać w portalu

- [Wyszukiwarka ofert PHP](https://nofluffjobs.com/pl/PHP) pokazuje oferty backendowe i fullstack, także z tytułem Senior. PHP jako tag wyszukiwania nie gwarantuje, że każda oferta dotyczy stanowiska programisty PHP. Przydatne mogą być również oferty bez słowa Senior w tytule.
- [Widok PHP i pracy zdalnej](https://nofluffjobs.com/remote/PHP) pokazuje filtry technologii, seniority (m.in. Senior, Expert i Lead), lokalizacji, trybu pracy, wynagrodzenia, języka pracy i rodzaju umowy. To możliwości interfejsu, nie potwierdzone parametry dostępnego API. Nie zweryfikowano filtra wymiaru czasu pracy ani kompletności poszczególnych kategorii.
- [Przykład PHP / Fullstack Developer](https://entrypoint-prod.nofluffjobs.com/pl/job/php-fullstack-developer-itfs-warszawa-2) zawiera Senior, lokalizację, opis hybrydy, datę ważności, technologie obowiązkowe i mile widziane, język, warunki współpracy i informacje o kliencie. Strony wyników i ogłoszeń mogą się zmieniać; danych z pojedynczej oferty nie należy traktować jako gwarantowanego schematu dla wszystkich.
- [Inna oferta](https://entrypoint-prod.nofluffjobs.com/pl/job/php-developer-regular-senior-iai-szczecin-1) ma w tytule Regular/Senior, ale w polu poziomu widnieje Mid. To przykład ryzyka utraty trafnych wyników przy zbyt wąskim filtrowaniu seniority. Praca zdalna, lokalizacja, liczba dni w biurze i prawo pracy z Polski wymagają osobnej oceny treści; brak potwierdzenia pozostaje niewiadomą.
- Nie każda oferta pokazuje kwotę na liście: [wyniki PHP](https://nofluffjobs.com/pl?criteria=PHP) zawierają również pozycje z komunikatem o sprawdzeniu wynagrodzenia. Nie należy zakładać kompletnych liczbowych widełek.

## Dostęp techniczny i warunki

| Obszar | Wynik i brakujące informacje |
| --- | --- |
| Oficjalne API odczytu / RSS | Nie potwierdzono publicznej dokumentacji, kanału ani uprawnienia do ich używania na potrzeby agregacji. Dokumentacja integracji publikacyjnej, jeśli istnieje, sama nie potwierdza prawa odczytu wszystkich ofert. |
| Endpointy aplikacji | [robots.txt](https://nofluffjobs.com/robots.txt) zawiera `Disallow: /api/` dla `User-agent: *`. To dyrektywa dla crawlerów, nie licencja ani samodzielna odpowiedź na pytanie o zgodę. Publiczny kod niezależnych klientów ujawnia nieoficjalne żądania opisane poniżej; szczegół jednego ogłoszenia zwrócił JSON w przeglądarce; wyszukiwania nie potwierdzono w tym teście. |
| Identyfikacja | Przeglądarka pokazuje adresy ogłoszeń, ale nie zweryfikowano stabilnego identyfikatora, zachowania URL po zmianie tytułu, deduplikacji ani ponownej publikacji. Nie przyjmować sluga za trwały klucz bez umowy i testów. |
| Paginacja i zakres | Nie ustalono obsługi stronicowania lub kursora w dostępnym kontrakcie, limitów, kompletności, historycznego eksportu ani stabilnego snapshotu podczas zmian listy. Widoczny przycisk dalszych ofert nie stanowi gwarancji pełnej synchronizacji. |
| Zmiany i koniec oferty | W przykładach widać datę ważności; nie potwierdzono pola ostatniej aktualizacji, kanału zmian, webhooków, tombstone, odczytu wycofanych ogłoszeń ani reguł przedłużeń. Nieobecność w niepełnym przebiegu nie potwierdza wygaśnięcia. |
| Warunki dostępu | Nie ustalono ceny, limitów, częstotliwości, uwierzytelnienia, warunków przechowywania, dozwolonego przekazania fragmentów do AI, retencji historii, sposobu atrybucji ani zasad usunięcia danych. Użycie dostawcy pośredniego nie stanowi potwierdzenia zgody operatora. |

Regulamin § 2 ust. 11 przewiduje dodatkowe zasady dla danych dostępnych po zalogowaniu i informacji wysyłanych e-mailem. Alert e-mail istnieje na [stronie wyników](https://nofluffjobs.com/pl/PHP), lecz jego istnienie nie oznacza zgody na automatyczne przetwarzanie lub pełny import ofert. [Regulamin](https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf#page=7).

## Badanie techniczne publicznego kodu — 2026-11-03

To analiza kodu stron trzecich oraz pojedynczej odpowiedzi live, a nie dokumentacja operatora. Nie znaleziono oficjalnego kontraktu odczytowego ani SLA. [robots.txt](https://nofluffjobs.com/robots.txt) wskazuje `Disallow: /api/` i `/posting/` dla `User-agent: *`. Jednostkowy odczyt szczegółów w przeglądarce pozwolił obejrzeć JSON; sam interfejs przeglądarki nie ujawnił kodu HTTP. Próby bezpośrednie z terminala nie przeszły rozwiązywania DNS (kod curl 6), więc nie stanowią odpowiedzi serwera. Osobny test w kontenerze 2026-11-03 (Python requests Session bez proxy i automatycznych ponowień, odstęp 2 s) dał `HTTP 403`, `text/html`, bez przekierowania dla GET szczegółu i POST wyszukiwania opisanych poniżej. Nie próbowano obchodzić blokady. Rozbieżność z odczytem przeglądarki nie ustala przyczyny odmowy ani statusu przeglądarki. Poniższe adresy i nazwy służą ocenie wykonalności, nie są zgodą na import.

### Dwa zaobserwowane warianty żądania

- [career-ops, utrwalony commit `9b17a8a`, konstrukcja żądania](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L54-L93) oraz [wywołanie](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L118-L157) pokazują `POST https://nofluffjobs.com/api/search/posting`, `Accept: application/json, text/plain, */*`, `Content-Type: application/infiniteSearch+json`. Parametry URL to `sort=newest`, `withSalaryMatch=true`, `pageTo`, `pageSize`, `salaryCurrency`, `salaryPeriod`, `region`, `language`; wartości domyślne klienta to odpowiednio 20, PLN, month, pl i pl-PL. Przy tekście klient wysyła `rawSearch`, `url.searchParam`, `criteria`, `pageSize` i `withSalaryMatch`; alternatywnie obiekt `criteriaSearch` z tablicami. Kod nie dodaje jawnego tokenu ani nagłówka Authorization; nie dowodzi to obecnego dostępu anonimowego ani braku innych wymagań serwera.
- [go-nofluffjobs, kod klienta](https://github.com/necsord/go-nofluffjobs/blob/main/nofluffjobs/client.go) i [model](https://github.com/necsord/go-nofluffjobs/blob/main/nofluffjobs/models.go) opisują ten sam `POST` z `Content-Type: application/json`, parametrami `limit`, `offset`, `salaryCurrency`, `salaryPeriod`, `region` oraz JSON `page`, `rawSearch`, `criteriaSearch`. Ten kod na gałęzi `main` jest odnośnikiem zmiennym; jego stan sprawdzono 2026-11-03. [README](https://github.com/necsord/go-nofluffjobs#usage) podaje przykład `limit=50`, `offset=0`, `page=1` i wymaganie Golang oraz `b2b`. To przykład klienta, nie udokumentowane wartości graniczne operatora.

Pola `criteriaSearch` w kodzie obejmują m.in. `requirement`, `category`, `keyword`, `seniority`, `city`, `employment`, `jobLanguage`, `jobPosition`, `company`, `id`, `more` i `salary` z `currency`, `greaterThan`, `period`; career-ops dodaje `country`, `province`, `applicationStatus`, `withSalaryMatch`. Istnienie pól nie dowodzi ich aktualnej obsługi, składni wartości, semantyki AND/OR/NOT, kompletności wyników ani tego, że technologie wymagane i opcjonalne można oddzielić filtrem. Nie potwierdzono filtra wymiaru czasu. Produkt potrzebuje dowolnych technologii i konfigurowalnych kryteriów; filtrowanie lokalne po pobraniu dopuszczalnego zakresu może być konieczne, jeśli kontrakt źródła nie pokryje wymagań.

### Paginacja, odpowiedź i szczegóły

[career-ops](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L118-L157) zwiększa `pageTo` od 1, domyślnie do pięciu stron po 20; przerywa po `totalPages` lub pustej tablicy `postings`, deduplikując URL w ramach przebiegu. Pięć stron i 20 to decyzje autora klienta, nie limit API. [Model Go](https://github.com/necsord/go-nofluffjobs/blob/main/nofluffjobs/models.go) wskazuje `totalCount` i `postings`, z kolei używa `limit`/`offset` i `page`. Relacja tych dwóch wariantów oraz stabilność sortowania, maksymalny rozmiar strony i spójny snapshot nie są znane. Zmiany w trakcie stronicowania mogą powodować pominięcia lub duplikaty; `totalCount` ani pusta strona same nie gwarantują pełnej synchronizacji.

Model Go przewiduje w pozycji `id`, `url`, `title`, `name`, `technology`, `category`, `seniority`, `regions`, `location.places`, `location.fullyRemote`, `posted`, `renewed`, `salary.from`, `salary.to`, `salary.type`, `salary.currency`. [career-ops](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L95-L116) interpretuje `posted` jako liczbę milisekund i konstruuje link z `url` albo `id`; jest to zachowanie klienta, nie gwarancja semantyki, strefy czasowej czy stabilności identyfikatora. `renewed` nie jest dowodem pola ostatniej modyfikacji całej treści. Model listy nie potwierdza pełnego opisu, wszystkich rodzajów wynagrodzenia, daty wygaśnięcia, wymaganych versus opcjonalnych technologii ani szczegółów lokalizacji zdalnej. Odczyt szczegółów opisano poniżej; jedna odpowiedź nie stanowi gwarantowanego schematu. Pola mogą być opcjonalne, niepełne lub zmienić typ.

Ścieżka nie ma widocznego prefiksu wersji, lecz nie ustalono polityki zmian ani zgodności wstecznej. Nie potwierdzono limitów, nagłówków limitów, zasad `429`/ponowień, SLA, walidacji, tokenów, cookies, dostępu partnerskiego ani stabilności hosta. Kod open source i jego licencja nie udzielają licencji na dane operatora. Nie ustalono również kanału zmian, webhooków, historii, usuniętych ofert, tombstone ani trwałości `id` przy odnowieniu i ponownej publikacji.

### Szczegóły: jednostkowy odczyt live

3 listopada 2026 otworzono w przeglądarce `GET` [szczegółów pojedynczego ogłoszenia](https://nofluffjobs.com/api/posting/php-fullstack-developer-itfs-warszawa-2). Widoczna była odpowiedź JSON bez logowania i ręcznego podawania tokenu. Przeglądarka nie pokazała kodu HTTP ani nagłówków, zatem nie przypisujemy im wartości; osobny klient w kontenerze otrzymał 403, jak opisano wyżej. To obserwacja jednej oferty, nie gwarancja anonimowego dostępu, schematu, kompletności ani prawa do automatyzacji.

**Lista w przeglądarce, 3 listopada 2026:** strona `/pl` zawiera `script#serverApp-state[type="application/json"]` o długości ok. 380 kB. W jednym wpisie o kluczu przypominającym hash (nie zakładać stałej nazwy) znaleziono obiekt z `criteriaSearch`, `postings`, `totalCount`, `totalPages`, `exactMatchesPages`, `rawSearch`, `params` i innymi metadanymi. `postings` miało 20 rekordów, a obiekt pierwszej pozycji pola `id`, `name`, `location`, `posted`, `title`, `technology`, `category`, `seniority`, `url`, `regions`, `fullyRemote`, `salary` i inne. Stan zawiera też oddzielny zbiór `/joboffers/oftheday?...`, 8 pozycji promowanych: łącznie początkowo w DOM było 28 kart. Po kliknięciu „Pokaż kolejne oferty” DOM powiększył się do 48 kart; nie zaobserwowano bezpośrednio żądania drugiej strony ani jego statusu. Stan Angular po kliknięciu nie jest dowodem, że kolejne 20 pozycji jest dopisywane do skryptu SSR. Liczniki `totalCount=21706` i `totalPages=168` nie muszą mieć tej samej podstawy (istnieją grupy salaryMatch/additionalSearch); nie wyciągać z nich mechanicznie pełności katalogu. To stan DOM po załadowaniu przeglądarki, nie dowód dostępności surowego HTML w workerze.

| Ścieżka | Typ i obserwacja w tej próbce |
| --- | --- |
| `id`, `postingUrl`, `defaultUrl`, `title`, `status` | string; `id` i URL zawierały ten sam slug, status `PUBLISHED`; nie dowodzi to trwałości tożsamości. |
| `basics.category`, `basics.technology` | string; `basics.seniority` tablica stringów. Główna technologia nie jest pełną listą wymagań. |
| `company.name`, `company.size`, `companyUrl` | string; dane firmy publikującej nie dowodzą tożsamości zatrudniającego ani klienta. |
| `requirements.musts`, `requirements.nices` | tablice obiektów `{value: string, type: string}`; dają odrębne wymagane i mile widziane tagi. `requirements.description` jest stringiem HTML i zawiera dodatkowy kontekst; `requirements.languages` jest tablicą obiektów `type`, `code`, `level`. |
| `details.description` | string HTML; `specs.dailyTasks` tablica stringów. Zachowanie formatowania oraz bezpieczna prezentacja HTML wymagają osobnego rozwiązania. |
| `location.places` | tablica obiektów z `city`, `country.code`, `country.name`, adresem i `geoLocation`; `location.remote` liczba, `remoteFlexible` boolean, `hybridDesc` string. Znaczenie liczby i możliwość pracy z Polski nie wynikają automatycznie z tych typów. |
| `essentials.originalSalary` | obiekt z `currency`, `types` i znacznikami widoczności; w próbce `types.b2b` zawiera `period: "Hour"`, liczbową tablicę `range` i `paidHoliday: false`. Warunki mogą różnić się per umowa; podstawy kwoty nie należy zgadywać. |
| `recruitment.languages`, `recruitment.processSteps` | tablice odpowiednio obiektów z kodem i stringów; `onlineInterviewAvailable` boolean. |
| `posted`, `expiresAt`, `version` | odpowiednio liczba całkowita, string daty bez jawnej strefy i liczba całkowita; obserwacja nie ustala jednostki, strefy ani semantyki wersji. `postedOrRenewedDaysAgo` to liczba, ale nie zastępuje daty zmiany treści. |

Dla porównania [artykuł operatora z 2019 r.](https://nofluffjobs.com/pl/log/praca-w-it/jak-zbudowac-narzedzie-cli-w-node-js/) przedstawiał starszy `GET /api/posting` jako przykład programistyczny; nie potwierdza obecnego kontraktu ani uprawnień do cyklicznego pobierania. [Komercyjny opis zewnętrznego narzędzia](https://apify.com/muhammadafzal/nofluffjobs-scraper) deklaruje listę i szczegóły JSON, ale jego przykładowe dane są syntetyczne i nie stanowią obserwacji odpowiedzi operatora ani zgody na użycie danych.

### Protokół adaptera do sprawdzenia po uzgodnieniu

1. Przyjmij konfigurowalny zakres: dowolne technologie (dowolna/wszystkie/wykluczenia), poziom, lokalizacja, tryb, umowa, wymiar czasu i wynagrodzenie; nie wpisuj konkretnego języka programowania na stałe. Mapuj na filtry źródła tylko semantykę potwierdzoną testami; pozostałe stosuj lokalnie na dozwolonym zakresie, zachowując niewiadome.
2. Pobierz każdą stronę listy i szczegóły wszystkich pozycji wymagających odświeżenia; zapisuj identyfikator źródła, URL, surowe wartości, czas obserwacji oraz informację o kompletnym/niepełnym przebiegu. Schemat i liczbę żądań uzgodnij z operatorem.
3. Normalizuj osobno tagi obowiązkowe i opcjonalne, warunki dla każdego rodzaju umowy, walutę i okres, pochodzenie danych o firmie, lokalizację i opis trybu; HTML przetwarzaj bezpiecznie. Wymiar godzin, podstawa kwoty i prawo pracy z Polski mogą pozostać niewiadome.
4. Deduplikuj po identyfikatorze źródłowym tylko w granicach potwierdzonej stabilności; publikację, odnowienie, zmianę treści i wygaśnięcie traktuj jako oddzielne zdarzenia. Błąd, limit lub zmiana listy w trakcie pobierania oznacza niepełny przebieg; brak w nim nie oznacza wygaśnięcia.
5. Przed wdrożeniem sprawdź pełną paginację, granice i zachowanie filtrów, opcjonalność/typy na różnych ogłoszeniach, zachowanie dla wycofanych ofert i zmiany URL, a także statusy `429`/`5xx`, retry i dozwoloną retencję. Jeden przykład nie wystarcza do ustalenia tych reguł.

### Konsekwencje dla projektu po uzyskaniu uzgodnienia

Przechowywać identyfikator źródła, źródłowy URL i czas pierwszej/ostatniej obserwacji oddzielnie od tożsamości oferty między portalami; traktować stabilność `id` jako hipotezę. Zachowywać wersje i różnice treści tylko w zakresie uzgodnionej retencji, wraz z pochodzeniem, walutą, okresem i podstawą kwoty. `posted`, `renewed`, wykrycie i potwierdzone wygaśnięcie to osobne zdarzenia. W razie błędu strony, limitu lub niepełnego przebiegu oznaczyć synchronizację jako niepełną; brak w wynikach nie dowodzi wygaśnięcia. Techniczne retry, liczba żądań i harmonogram wymagają uzgodnionych limitów, a nie wartości wywnioskowanych z kodu.

## Kolejny krok: zapytanie do operatora

Operator podaje [kontakt do sprzedaży i produktu](https://nofluffjobs.com/pl/about/): **sales@nofluffjobs.com**, oraz adres ogólny **info@nofluffjobs.com**. To punkty kontaktu, nie potwierdzenie istnienia programu partnerskiego. Wiadomości nie wysłano.

W zapytaniu opisać jednoosobową aplikację, zaplanowaną synchronizację raz dziennie i na żądanie oraz przechowywanie ogłoszeń i ich historii lokalnie lub na własnym VPS. Poprosić o:

1. Dostęp do oficjalnego API/feedu odczytu albo pisemne warunki innego sposobu pobierania, wraz z ceną i ograniczeniami osobistego użytku.
2. Zakres konfigurowalnych filtrów technologii, poziomu doświadczenia, lokalizacji/Polski, trybu pracy, umowy, wymiaru czasu, języka i wynagrodzenia; pełny schemat listy i szczegółów oraz rozróżnienie technologii obowiązkowych i opcjonalnych.
3. Trwały identyfikator, paginację i gwarancję kompletności, limity i częstotliwość, daty publikacji/zmiany/wygaśnięcia, ponowne publikacje oraz sposób wykrycia wycofania.
4. Zgodę na lokalne przechowywanie pełnej treści i poprzednich wersji po wygaśnięciu, wykorzystanie fragmentów przez zewnętrzne AI, wymagane odnośniki i atrybucję, oraz zasady usuwania danych.

Do otrzymania odpowiedzi traktować No Fluff Jobs jako źródło do ręcznego przeglądania, a projekt adaptera i jego harmonogram jako niepotwierdzone. Nie interpretować braku odpowiedzi jako zgody.

## Uzupełnienie: porównanie nagłówków z kontenera

Aktualne próby z 2026-11-03: [macierz i wnioski](naglowki-http.md). NFJ HTML i API zwracają 200 po zmianie samego User-Agent na Chrome, a bazowy klient nadal 403. Bulldogjob .com obecnie zwraca 200 nawet bazowemu klientowi; .pl i theprotocol nadal 403 z `cf-mitigated: challenge`, także przy zestawie nagłówków przeglądarkowych. Wyniki uzupełniają i częściowo zastępują wcześniejszą obserwację 403; nie potwierdzają trwałości ani pełnej synchronizacji.
