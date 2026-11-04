# Polskie portale — porównanie techniczne integracji

Stan: 2026-11-03. Badano próbki w przeglądarce, publiczny kod innych projektów i wybrane pojedyncze żądania z kontenera worker. Filtry technologii, specjalizacji i poziomów są konfiguracją właściciela, a nie stałą właściwością adaptera. Dane są obserwacjami, nie dokumentacją ani gwarancją kontraktu operatora.

| Źródło | Sposób odczytu | Paginacja / szczegół | Wynik w bieżącym środowisku |
| --- | --- | --- | --- |
| [Just Join IT](justjoinit.md) | JSON `GET /api/candidate-api/offers`; `data`, `meta`, wymagane i opcjonalne umiejętności, dane płacowe. | Kursor `meta.next.cursor` → `from`; szczegół `GET /api/candidate-api/offers/{slug}` ma HTML `body` i ID. Próbka listy `guid` zgadzała się z `id` szczegółu. | Lista, druga strona i jeden szczegół: worker HTTP 200 JSON. Nie potwierdzono, czy limit `totalItems=10000` oznacza twardy próg ani pełnego zakresu. |
| [No Fluff Jobs](nofluffjobs.md) | JSON szczegółu `/api/posting/{slug}`; lista strony Angular posiada osadzony `script#serverApp-state` z `postings`, `criteriaSearch`, `totalPages`. Publiczne implementacje używają POST `/api/search/posting`. | Widok po kliknięciu ładuje kolejne 20 kart; parametry i odpowiedź POST drugiej strony nie zostały potwierdzone w teście. Szczegół ma wymagane/opcjonalne technologie, opis, warunki i daty. | W przeglądarce stan listy i JSON szczegółu widoczne; worker dostał HTTP 403 HTML dla GET szczegółu i POST listy. |
| [Bulldogjob](bulldogjob.md) | `GET /companies/jobs`: `script#__NEXT_DATA__`, `props.pageProps.jobs`, `totalCount`, `slugState`; szczegół `props.pageProps.data.job`. | Zaobserwowano `/companies/jobs/s/page,2`, po 50 pozycji; szczegół ma opis, wymagania, daty, stan, płace i technologie. ID zawiera numer i slug. | W przeglądarce odczytano dwie strony, filtr i szczegół; worker dostał HTTP 403 HTML dla listy. |
| [theprotocol.it](theprotocol.md) | `GET /praca`: `__NEXT_DATA__.props.pageProps.offersResponse`; szczegół `pageProps.offer` oraz JSON-LD `JobPosting`. | Zaobserwowano `?pageNumber=2`, po 50 elementów; identyfikator listy zgadzał się ze szczegółem, który zawiera sekcje tekstowe, technologie i daty. Przykładowy filtr `/filtry/go;t`. | Przeglądarka odczytała listę, stronę 2, filtr i szczegół; worker dostał HTTP 403 HTML dla listy. |

## Konsekwencje dla architektury

1. Wspólny interfejs adaptera powinien przyjmować zestaw kryteriów bez kodowania PHP, Go czy seniority na stałe. Źródło może nie obsługiwać wszystkich kombinacji; należy odróżnić filtr potwierdzony, wykonywany lokalnie oraz niemożliwy do oceny.
2. Identyfikator ogłoszenia i URL, surowe pola, daty źródła, osobno momenty obserwacji i wersje treści mają być zachowane; stabilność identyfikatorów i semantyka dat wymagają dalszych prób. Nie łączyć automatycznie ofert między portalami na podstawie identycznego tytułu.
3. Przy braku atomowego snapshotu deduplikować identyfikatory i wykrywać zmiany liczników, zapętloną paginację i brakujące strony. 403, uszkodzony HTML/JSON, pominięty szczegół, limit lub przerwanie to niepełny przebieg, nie puste wyniki lub wygaśnięcie.
4. Rozdzielić techniczną możliwość odczytu DOM w przeglądarce od możliwości pracy na serwerze/VPS: w tej próbie trzy serwisy odmówiły prostemu klientowi w workerze. Nie znamy przyczyn ani trwałości wyniku. W raportach szczegółowych zapisano warunki i niewiadome dotyczące dopuszczalnego dostępu.
5. Pierwszym kandydatem do małego prototypu adaptera jest Just Join IT, ponieważ poza przeglądarką sprawdzono z workera zarówno listę i następną stronę, jak i szczegół. Potrzebne są fixture'y wielu odmian danych, testy kursora i walut, rozpoznanie ograniczenia 10000 i semantyki filtrów oraz przetestowanie błędów/niepełności. Nie jest to potwierdzenie trwałości, pełnej synchronizacji ani prawa do cyklicznego importu.

Nie badano wszystkich kombinacji filtrów, ostatnich stron, pełnych schematów, wycofanych ofert, granic częstotliwości lub dostępności z przyszłego VPS. Próby stanowią techniczną próbkę, nie dowód pokrycia rynku. W badaniu nie zapisano ofert do bazy ani nie wykonywano masowego importu.

## Uzupełnienie: porównanie nagłówków z kontenera

Aktualne próby z 2026-11-03: [macierz i wnioski](naglowki-http.md). NFJ HTML i API zwracają 200 po zmianie samego User-Agent na Chrome, a bazowy klient nadal 403. Bulldogjob .com obecnie zwraca 200 nawet bazowemu klientowi; .pl i theprotocol nadal 403 z `cf-mitigated: challenge`, także przy zestawie nagłówków przeglądarkowych. Wyniki uzupełniają i częściowo zastępują wcześniejszą obserwację 403; nie potwierdzają trwałości ani pełnej synchronizacji.

## Aktualizacja: działający transport curl_cffi

2026-11-03 potwierdzono odczyt Bulldogjob **.pl** i theprotocol z kontenera przez curl_cffi z profilem Chrome/Safari i HTTP/2, bez cookies właściciela. Lista, druga i ostatnia strona, filtr oraz szczegół zwróciły 200 i dane aplikacji. Zwykły requests, zwykły curl HTTP/2 oraz profil Chrome wymuszony na HTTP/1.1 nadal otrzymały challenge. Wcześniejsza blokada techniczna została rozwiązana w próbce diagnostycznej. [Wyniki, ograniczenia i reproduktory](dostep-http-rozwiazanie.md). Connectorów i pełnego importu jeszcze nie wdrożono.
