# Dodatkowe źródła obok JobSpy

Data weryfikacji: 2026-11-03. Zakres: dokumentacja operatorów i przykładowa odpowiedź Remote OK; bez uruchamiania scraperów, instalowania cudzych pakietów i pomiaru liczby pasujących ofert. Kontekst: `bd show oferty-pracy-y81.14`. Senior PHP, Polska lub praca zdalna dostępna z Polski. To ocena kandydatów, nie wdrożenie.

„Nowe” oznacza dodatkowe względem obecnych adapterów aplikacji, nie nowo powstałe portale. Dokumentacja API nie dowodzi liczby odpowiednich rekrutacji. Geograficzna dostępność pozostaje osobnym kryterium od samego remote.

## Priorytety

| Priorytet | Źródło | Potwierdzony dostęp i użyteczność | Istotne ograniczenie |
| --- | --- | --- | --- |
| 1 | **Himalayas** | API bez obowiązkowego klucza; wyszukiwanie `q`, `country`, `seniority`, `worldwide`; opisy i płace z okresem. Dobra podstawa wyszukiwania PHP/Senior/PL. | Potrzebne źródło i niezmieniony `applicationLink`; dzienne odświeżanie. Nie wykazano tu liczby dopasowań. |
| 2 | **Jobicy** | Publiczne JSON, paginacja kursorem, geografia, kategoria, słowo kluczowe; osobne sprawdzanie statusów zapisanych ID. | Feed obejmuje ostatnie 7 dni. Zniknięcie z niego nie oznacza zamknięcia oferty. |
| 3 | **Remote OK** | Publiczne JSON; realna odczytana odpowiedź ma ID, opis, tagi, lokalizację i pola płac. Istnieje propozycja adaptera w JobSpy — szczegóły w raporcie forków. | Pierwszy element tablicy to metadane/warunki. Remote nie gwarantuje pracy z Polski. |
| 4 | **Arbeitnow** | Operator opisuje bezpłatne API bez klucza, oferty Europy z ATS, pole remote; osobny endpoint UK. | Należy czytać ograniczenia miejsca pracy; nie zakładać, że niemieckie/UK remote obejmuje Polskę. |
| 5 | **Greenhouse / Lever / Ashby** | Opisane interfejsy publikowanych ofert konkretnych firm. Przydatne do monitorowania wybranych pracodawców. | Wymagają rejestru firm i identyfikatorów tablic. Nie są globalną wyszukiwarką całego rynku. |
| 6 | **Remotive / We Work Remotely** | Opisane API Remotive i publiczne kanały RSS WWR, w tym backend/fullstack. | Remotive ma opóźnienie 24 h; RSS WWR nie daje w tej weryfikacji potwierdzenia kompletnej synchronizacji i zamknięć. |

Powyższa kolejność to rekomendacja projektowa oparta na dopasowaniu interfejsów, nie ranking wielkości rynku.

## Dowody i wymagania integracji

### Himalayas

Oficjalny opis wskazuje browse z kursorem i maksymalnie 20 rekordami, search z paginacją oraz kontrolę pojedynczego ogłoszenia. Filtr kraju obejmuje także oferty worldwide. Wyniki stron mogą się przesuwać; deduplikować po `guid`. `pubDate` oznacza ostatnią aktualizację. API rozróżnia 200/open i 410/closed; 404 nie jest równoważne temu drugiemu. Bez klucza współdzielona pula, bezpłatny klucz daje 60/min i 10 000/dzień, przekroczenie 429. Operator wymaga atrybucji i użycia `applicationLink`, zakazuje dalszego rozsyłania danych innym agregatorom. [Dokumentacja operatora](https://himalayas.app/api), [referencja API](https://himalayas.app/docs/remote-jobs-api).

### Jobicy

Aktualny opis wskazuje `GET /api/jobs`, do 100 rekordów na stronę i `nextCursor`. Nowy przebieg automatyczny najwyżej raz na godzinę; strony kursora kolejno. Feed to 7 dni, natomiast `/api/jobs/status?ids=...` rozróżnia active/closed/unknown. Bez klucza adres prowadzi do Jobicy; płatna opcja oryginalnych linków ATS nie jest potrzebna do naszego importu. Operator dopuszcza zwykłe integracje bez osobnej umowy i wymaga oznaczenia źródła. [Dokumentacja i fair use](https://jobicy.com/jobs-rss-feed).

### Remote OK i Arbeitnow

Odczyt Remote OK potwierdza JSON, nie poprawność każdej płacy ani kompletność historii. Warunki w metadanych wymagają nazwy źródła i linku zwrotnego; logo wymaga osobnej zgody. [Endpoint z warunkami](https://remoteok.com/api).

Arbeitnow opisuje dane Europy z kilku ATS i udostępnia odnośnik do specyfikacji Postman. To kandydat do pilota; brak tu potwierdzonego limitu żądań, obsługi zamknięć i pokrycia PHP. [Opis operatora](https://www.arbeitnow.com/blog/job-board-api).

### Bezpośrednio od pracodawcy: ATS

- Greenhouse: GET bez uwierzytelniania, `boards/{board_token}/jobs?content=true` zawiera opis. [Job Board API](https://docs.greenhouse.io/job-board).
- Lever: listy pod identyfikatorem firmy, globalny i europejski host, JSON, opisy i opcjonalna płaca. Dokumentacja wyklucza pełnotekstowe przeszukiwanie całego rynku; podany limit 2/s dotyczy **POST aplikacji**, nie GET ofert. [Oficjalne repozytorium](https://github.com/lever/postings-api).
- Ashby: tablica konkretnej organizacji, opis, lokalizacje, tryb i opcjonalne dane wynagrodzenia przez `includeCompensation=true`. [Dokumentacja operatora](https://developers.ashbyhq.com/docs/public-job-posting-api).

Nie ustalono w tym badaniu ogólnej licencji na dalszą redystrybucję ofert wszystkich klientów ATS. Nasz przypadek to osobisty monitoring; nie projektujemy publikacji cudzej bazy.

### Remotive i WWR

Remotive zaleca maksymalnie cztery odczyty dziennie; ponad dwa na minutę prowadzą do blokady. Wymaga źródła i linku Remotive, oferty opóźnione o 24 h. [README operatora](https://github.com/remotive-com/remote-jobs-api).

WWR publikuje RSS ogólny oraz backend/fullstack i prosi o link zwrotny. Ten dokument potwierdza kanał; nie stanowi pełnego audytu warunków, retencji lub kompletności. [Oficjalny katalog RSS](https://weworkremotely.com/remote-job-rss-feed).

## Zalecenie dla aplikacji

Najpierw mały pilot Himalayas, potem Jobicy i Remote OK. Własne adaptery TypeScript mogą korzystać ze wspólnego zapisu ogłoszeń bez rozszerzania zależności Python tam, gdzie wystarczy JSON. Wybrane firmy przez ATS to osobny późniejszy kierunek. Nadal wymagane: limity właściwe dla operatora, atrybucja, zachowanie źródłowych płac i niepełnych wyników, bez zgadywania dostępności z Polski czy seniority.
