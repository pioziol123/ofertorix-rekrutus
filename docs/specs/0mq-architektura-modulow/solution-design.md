# Architektura modułów — Solution design

Wymagania: [requirements.md](requirements.md). Reguły ogólne: [zasady architektury i pisania kodu](../../architecture/moduly-i-zasady-kodu.md).

Dokument przenosi wymagania na język techniczny. Decyzje i kontrakty są wiążące: odstępstwo wymaga zmiany dokumentu przed implementacją. Nazwy plików, katalogów wewnętrznych, typów i funkcji wybiera wykonawca zgodnie z [zasadami architektury](../../architecture/moduly-i-zasady-kodu.md#katalog-modułu) i sekcją [T-01](#t-01). Opisy stanu obecnego dotyczą rewizji `d8e71ba` z 2026-11-15.

## Zasady techniczne wspólne dla zadań

<a id="t-01"></a>

**T-01. Położenie kodu.**
- Pliki wymagane przez framework i uruchomienie zostają na miejscu i delegują do publicznych operacji modułów. Należą do nich:
  - trasy API serwera Nuxt i jego narzędzia,
  - widoki,
  - punkt wejścia workera,
  - skrypty uruchomieniowe projektu,
  - migracje.
- Pozostały kod modułu trafia do jego katalogu w drzewie modułów, z publicznym wejściem, zgodnie z katalogiem modułu z zasad architektury.
- Mechanizmy bez właściciela domenowego, czyli dostęp do bazy i klient pg-boss, zostają we wspólnej infrastrukturze poza modułami.
- Testy dedykowane modułowi leżą przy module, a testy przekrojowe we wspólnym katalogu testów.
- Pierwsze zadanie, które tworzy kod TypeScript w drzewie modułów, rozszerza konfigurację sprawdzania typów narzędzi o to drzewo; dziś obejmuje ona tylko kod wspólny, worker i skrypty.
- Widoków nie przenosimy. Struktury frameworka nie przebudowujemy dla samego ujednolicenia katalogów.
- Każde zadanie umieszcza tworzony i przenoszony kod od razu w docelowym miejscu. Zadanie 0mq.12 porządkuje resztę.

<a id="t-02"></a>

**T-02. Dostęp do bazy w zmienianym kodzie.** Po zadaniu 0mq.13 kod tworzony lub przenoszony w zadaniu:
- korzysta ze wspólnego akcesora i wspólnej operacji transakcyjnej ([A13](#a13));
- nie pobiera połączeń z puli samodzielnie i nie wysyła ręcznie `BEGIN` ani `COMMIT`;
- nie używa blokad sesyjnych PostgreSQL (`pg_advisory_lock`, `pg_try_advisory_lock`, `pg_advisory_unlock`). Blokady transakcyjne (`pg_advisory_xact_lock`) są dopuszczalne.

<a id="t-03"></a>

**T-03. Testy na bazie.** Testy integracyjne działają na izolowanym schemacie PostgreSQL i izolowanym schemacie pg-boss, jak istniejące testy integracyjne. Wspólny mechanizm dostępu do bazy ustawia się na pulę izolowanego schematu przed pierwszym użyciem. To przygotowanie testu, a nie zmiana jego asercji (W-AC02).

<a id="f2"></a>

## Synchronizacja źródeł — realizacja F2

Reguły funkcjonalne: [F2](requirements.md#f2).

**Kolejka pg-boss.** Wersja 12.38.0, sprawdzona 2026-11-15 w zainstalowanym pakiecie, udostępnia:
- polityki kolejki `standard`, `short`, `singleton`, `stately`, `exclusive` i `key_strict_fifo`,
- `singletonKey` zadania,
- grupę zadania z globalnym limitem `groupConcurrency` w obsłudze kolejki,
- `heartbeatSeconds` (co najmniej 10) z automatycznym odświeżaniem,
- sygnał przerwania (`AbortSignal`) przekazywany do handlera,
- `retryLimit`, `expireInSeconds`,
- wysłanie zadania w transakcji wywołującego (opcja `db`).

Wymaganie "przed implementacją potwierdzić dostępność opcji pg-boss" z zadań 0mq.3 i 0mq.5 jest tym samym spełnione.

**Podział mechanizmów.**

| Reguła | Mechanizm | Zadanie |
| --- | --- | --- |
| F2-06 | Jedna kolejka synchronizacji; grupa zadania równa nazwie źródła; `groupConcurrency` 1 w obsłudze kolejki (limit globalny, w bazie); kolejność pobierania zadań w grupie według utworzenia. | 0mq.16 |
| F2-07 | Częściowe indeksy unikalne przebiegów i przyjęcie z [0mq.3](#a3). | 0mq.3, 0mq.16 |
| F2-13 | `heartbeatSeconds` 30, `retryLimit` 2, `expireInSeconds` 3600; sygnał przerwania handlera; numer próby przebiegu jako token ochronny zapisów. | 0mq.5 |
| F2-10 | Wysyłka zadania w transakcji przyjęcia (opcja `db`); CLI odpytuje stan przebiegu. | 0mq.16 |

**Stan obecny.** Każde źródło ma własną ścieżkę zlecania, wykonania i odzyskiwania. Są to:
- SOLID.Jobs z kolejką i harmonogramem,
- JobSpy z osobną kolejką na portal,
- polskie portale z osobną kolejką na portal,
- Himalayas uruchamiany synchronicznie z CLI, bez kolejki.

Ścieżki chronią wykonanie blokadami sesyjnymi, a zlecanie blokadą transakcyjną. Zapis porcji jest wspólny. Oznaczanie niewidzianych ogłoszeń wykonuje tylko ścieżka SOLID.Jobs, po kompletnym przebiegu i w jednej transakcji ze statusem kompletnym.

<a id="a13"></a>

## Zadanie 0mq.13 — Wspólny dostęp do bazy i transakcje

Wymagania: [A13](requirements.md#a13).

### Decyzje

1. **Pula.** Połączeniami zarządza pula `pg`, jedna na proces. Zapytanie poza transakcją pobiera połączenie na czas zapytania, transakcja na czas swojego trwania. Kod modułów nie pobiera połączeń samodzielnie i nie trzyma ich między operacjami. Zastępuje to wcześniejszą zasadę jednej sesji na proces.
2. **Akcesor.** Wspólna infrastruktura udostępnia akcesor wykonawcy zapytań. W transakcji zwraca on połączenie tej transakcji, a poza nią pulę. Kontekst transakcji przechodzi przez `AsyncLocalStorage`, więc sygnatury operacji domenowych nie zawierają typu połączenia, a punkt wejścia niczego nie przygotowuje.
3. **Operacja transakcyjna.** Poza transakcją pobiera połączenie, wysyła `BEGIN`, wykonuje funkcję w kontekście tego połączenia i wysyła `COMMIT`. Przy błędzie wysyła `ROLLBACK` i zgłasza pierwotny błąd, a błąd samego `ROLLBACK` go nie zastępuje. Połączenie zawsze wraca do puli; połączenie uszkodzone jest zwalniane z błędem, żeby pula je odrzuciła. W trwającej transakcji operacja wykonuje funkcję bez `BEGIN` i `COMMIT`.
4. **Błąd wycofuje całość.** Pracy nie kontynuuje się po błędzie SQL w tej samej transakcji. SAVEPOINT nie jest stosowany.
5. **Repozytoria.** Dostęp do danych modułu realizują repozytoria w warstwie persystencji modułu, korzystające z akcesora. Repozytorium nie otwiera połączeń ani transakcji i nie jest częścią publicznego wejścia modułu. Przypada jedno na agregat, z metodami wynikającymi z przypadków użycia, bez ogólnych operacji CRUD dla każdej tabeli. Odczyty listowe z filtrowaniem i paginacją mogą mieć dedykowane zapytania.
6. **Bez blokad wierszy dla wywołującego.** Publiczne operacje odczytu nie zakładają blokad wierszy na rzecz wywołującego. Odczyt profilu i ogłoszenia z `FOR SHARE` przy publikacji oceny dopasowania znika w zadaniu 0mq.10, zgodnie z decyzją właściciela w [A13](requirements.md#a13). Blokady wierszy innego modułu wymagają osobnej decyzji.
7. **Kolejka w transakcji.** Wspólna infrastruktura udostępnia adapter wykonawcy zapytań dla opcji `db` pg-boss. Każde jego wywołanie przechodzi przez akcesor, więc zadanie wysłane w transakcji należy do niej.
8. **Bez blokad sesyjnych.** Blokady sesyjne wymagają stałego połączenia, więc kod przenoszony na wspólny mechanizm z nich rezygnuje (T-02). Ochrona przed podwójnym podjęciem pracy pozostaje jako warunkowa zmiana stanu w bazie.
9. **Niezależność od biblioteki.** Implementacja korzysta z `pg`. Późniejsza migracja na typowany konstruktor zapytań (rekomendacja: Kysely) nie zmienia sygnatur operacji ani repozytoriów.

### Kontrakt wspólnej infrastruktury

Wspólna infrastruktura dostępu do bazy, która zostaje poza modułami, udostępnia:

- **Akcesor wykonawcy zapytań.** Obiekt ma metodę `query` zgodną z `pg`, którą spełniają zarówno pula, jak i połączenie.
- **Operację transakcyjną** przyjmującą funkcję asynchroniczną i zwracającą jej wynik, o semantyce z decyzji 3.
- **Adapter dla opcji `db` pg-boss**, z decyzji 7.
- **Pulę procesu**, tworzoną leniwie z dotychczasowej konfiguracji połączenia i z dotychczasowym limitem 5 połączeń. Pulę można podmienić przed pierwszym użyciem, np. w teście na pulę izolowanego schematu. Podmiana w trakcie transakcji jest błędem programisty i zgłasza wyjątek.

Serwer i worker korzystają z puli procesu. Skrypty CLI, które dziś tworzą własną pulę, też przechodzą na pulę procesu. Dotychczasowe pomocnicze transakcje modułów i istniejące zapytania zostają bez zmian (A13-R08); usuwają je zadania 0mq.18 i zadania zmieniające dany kod.

Decyzje 1–9 trafiają do [zasad architektury](../../architecture/moduly-i-zasady-kodu.md) jako sekcja o dostępie do bazy danych. Ten dokument jest po wdrożeniu zapisem historycznym.

### Weryfikacja

Test integracyjny wspólnej infrastruktury według T-03:

| Kryterium | Sprawdzenie |
| --- | --- |
| A13-AC01, AC02 | Dwie operacje zapisujące wiersze; zewnętrzna zgłasza błąd po wewnętrznej. |
| A13-AC03 | Podczas trwania operacji zewnętrznej drugie połączenie spoza transakcji nie widzi zapisu operacji wewnętrznej. Dodatkowo podsłuch zapytań połączenia transakcji: jedno `BEGIN` i jedno `COMMIT`. |
| A13-AC04 | Dwie operacje w `Promise.all`, jedna z błędem. |
| A13-AC05 | Zadanie wysłane przez adapter pg-boss w transakcji z rollbackiem i z commitem; obecność zadania sprawdzona po identyfikatorze. |
| A13-AC06 | Pula testowa z limitem połączeń; liczba nieudanych operacji większa od limitu, potem operacja udana. Liczba wolnych połączeń puli wraca do stanu początkowego. |
| A13-AC07, AC08 | Przegląd dokumentacji i diffu. |

<a id="a1"></a>

## Zadanie 0mq.1 — Kontrakt konektora

Wymagania: [A1](requirements.md#a1).

### Kontrakt konektora

Kontrakt leży w warstwie adapterów modułu Źródła ofert, poza katalogami konkretnych konektorów. Konektor ma:

- **stałą nazwę**: dotychczasowy identyfikator źródła;
- **deklarację wnioskowania z braku**: wartość logiczną, z której korzysta zadanie 0mq.7;
- **wyznaczenie parametrów zakresu ze zlecenia**: wejście specyficzne dla źródła (np. zapytanie polskiego portalu), wynik to obiekt JSON parametrów;
- **pobranie**, które przyjmuje:
  - parametry zakresu,
  - funkcję przyjmującą porcję ogłoszeń,
  - sygnał przerwania.

  Wynikiem pobrania jest rezultat: *kompletny* albo *niekompletny z powodem* (tekst), oba z opcjonalną diagnostyką (obiekt JSON).

Ogłoszenie w porcji zawiera:

- **identyfikator zewnętrzny**: dotychczasowy klucz oferty w źródle;
- **adres**: URL albo brak;
- **datę ważności**: data albo brak, gdzie brak oznacza niewiadomą;
- **treść**: obiekt identyczny z obiektem, który dziś trafia do zapisu porcji, razem z kluczem oferty. Z niego liczony jest skrót treści, więc jego postać nie może się zmienić (A1-R05).

Semantyka pobrania:

- Konektor czeka na zakończenie przyjęcia porcji przed pobraniem następnej, więc zapis jest przyrostowy.
- Błąd zgłoszony przez funkcję przyjmującą porcję, czyli błąd zapisu, konektor przekazuje dalej bez przechwytywania.
- Po przerwaniu sygnału konektor kończy pobieranie najszybciej, jak to możliwe, i zgłasza błąd przerwania. Dotychczasowe ścieżki w tym zadaniu przekazują sygnał, który nie zostaje przerwany.
- Błędy, których komunikat jest dziś zapisywany w przebiegu (komunikaty adaptera o API i HTTP), konektor zgłasza jako dedykowany błąd konektora z tym samym komunikatem. Komunikat takiego błędu jest bezpieczny do zapisu: nie zawiera sekretów ani surowych odpowiedzi. Inne błędy wywołujący zastępuje komunikatem ogólnym, jak dziś.

### Konektory

| Źródło | Porcja | Rezultat |
| --- | --- | --- |
| SOLID.Jobs | strona API | Dotychczasowe kryteria:<br>- poprawna strona,<br>- stała liczba wyników i stron,<br>- liczba unikalnych identyfikatorów równa liczbie wyników,<br>- limit 1000 stron.<br><br>Duplikat czyni rezultat niekompletnym, ale nie zatrzymuje pobierania kolejnych stron. Unikalne identyfikatory konektor liczy sam. |
| Himalayas | strona API | dotychczasowe kryteria ścieżki Himalayas |
| portale JobSpy | jak dotychczasowe wywołanie zapisu porcji | dotychczasowe kryteria ścieżki JobSpy |
| polskie portale | jak dotychczasowe wywołanie zapisu porcji | dotychczasowe kryteria ścieżki polskich portali |

Struktura konektorów:

- Każdy konektor ma własny katalog w warstwie adapterów modułu.
- Portale JobSpy dzielą jedną implementację sparametryzowaną kluczem katalogu JobSpy; polskie portale analogicznie.
- Skrypty Python narzędzi pomocniczych zostają na miejscu jako pliki uruchomieniowe (T-01), a ich wywołanie należy do konektora.

Parametry zakresu:

- SOLID.Jobs i Himalayas zwracają dotychczasowe stałe parametry.
- JobSpy zwraca dotychczasowe parametry portalu.
- Polskie portale zwracają dotychczasowe parametry z zapytania po walidacji.

Odcisk zakresu liczy dotychczasowa funkcja skrótu z kanonicznym porządkiem kluczy, przeniesiona do modułu Źródła ofert. Listy o znaczeniu zbioru konektor sortuje i usuwa z nich powtórzenia; obecne zakresy takich list nie mają.

### Transport

Wspólny helper żądań HTTP obsługuje konektory, które same komunikują się ze źródłem (SOLID.Jobs, Himalayas):

- Timeout pojedynczego żądania wynosi 5 s, a ponowienia są najwyżej dwa (najwyżej trzy próby). Obie wartości są konfigurowalne parametrem.
- Do ponowienia kwalifikują się: błąd sieci, przekroczenie czasu, HTTP 429 i 5xx.
- Przed ponowieniem helper czeka tyle, ile wskazuje `Retry-After`, a bez tego nagłówka 1 s. Gdy `Retry-After` przekracza 60 s, zgłasza błąd konektora z komunikatem o odroczonym ponowieniu i statusem HTTP.
- Inny status helper zwraca wywołującemu.
- Zegar, funkcja oczekiwania i funkcja `fetch` są wstrzykiwalne na potrzeby testów.
- Odstęp 1 s między żądaniami SOLID.Jobs zostaje w konektorze SOLID.Jobs.

Konektory JobSpy i polskich portali uruchamiają procesy Python i zachowują obecne limity (F2-05):
- limit czasu zapytań w JobSpy,
- limity czytników polskich portali,
- limity czasu procesu.

### Zmiany w dotychczasowych ścieżkach

- Dotychczasowe funkcje wykonania synchronizacji czterech źródeł pobierają dane wyłącznie przez konektory.
- Funkcja przyjmująca porcję woła dotychczasowy zapis porcji z treściami ogłoszeń. Zadanie 0mq.4 zastępuje go nowym serwisem.
- Status przebiegu wynika z rezultatu konektora: rezultat kompletny prowadzi dotychczasową ścieżką kompletną, a niekompletny dotychczasową ścieżką błędu, z powodem jako komunikatem.
- Zlecanie, blokady i oznaczanie niedostępności zostają bez zmian; zastępują je zadania 0mq.3–0mq.5, 0mq.16 i 0mq.7.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A1-AC01 | Typecheck i przegląd kodu. |
| A1-AC02 | Test helpera z fałszywym zegarem: brak odpowiedzi (5 s), trzy odpowiedzi 503 (trzy próby), 404 (jedna próba), `Retry-After` 120 s (błąd konektora). |
| A1-AC03, AC04 | Test konektora SOLID.Jobs z atrapą `fetch`: trzy strony dają trzy porcje; duplikat w stronie i między stronami nie przerywa pobierania, a rezultat jest niekompletny. |
| A1-AC05, AC06 | Istniejące testy integracyjne synchronizacji wszystkich czterech ścieżek, uzupełnione o asercje identyfikatora, adresu, daty ważności, skrótu i treści zapisanych ogłoszeń tam, gdzie ich brakuje. |
| A1-AC07 | Test jednostkowy z odciskami domyślnych zakresów policzonymi przed zmianą i zapisanymi w teście. |
| A1-AC08 | Test jednostkowy deklaracji wszystkich konektorów. |

<a id="a2"></a>

## Zadanie 0mq.2 — Rejestr konektorów

Wymagania: [A2](requirements.md#a2).

### Kontrakt rejestru

- Rejestr budowany jest z listy konektorów. Powtórzona nazwa przerywa budowę dedykowanym błędem z nazwą.
- Rejestr udostępnia wyszukanie konektora po nazwie i listę nazw w kolejności rejestracji.
- Wyszukanie nieznanej nazwy zgłasza dedykowany błąd z nazwą w osobnym polu. Komunikat zawiera tylko nazwę.
- Rejestr aplikacji to jedyne miejsce, które importuje konkretne konektory. Rejestruje SOLID.Jobs, Himalayas, po jednym konektorze na każdy portal z katalogu JobSpy i na każdy polski portal.
- Rejestr nie filtruje źródeł wyłączonych w konfiguracji. Włączenie źródła sprawdzają, jak dotąd, operacje zlecania.
- Rejestr aplikacji powstaje przy imporcie modułu, więc błąd powtórzonej nazwy przerywa start serwera i workera.

### Zmiany w dotychczasowych ścieżkach

Dotychczasowe funkcje synchronizacji pobierają konektor z rejestru po nazwie źródła. Punkty wejścia (worker, skrypty CLI, trasy API źródeł) nie importują konektorów. Testy mogą wstrzykiwać konektor albo rejestr w miejsce dotychczas wstrzykiwanych funkcji pobierających strony.

### Weryfikacja

Test jednostkowy rejestru dla A2-AC01–AC03. Dla A2-AC04 przeszukanie importów konkretnych konektorów poza rejestrem i samymi konektorami nie daje wyników.

<a id="a3"></a>

## Zadanie 0mq.3 — Stan przebiegu

Wymagania: [A3](requirements.md#a3).

### Decyzja: unikalność oczekującego przebiegu w bazie

Regułę F2-07 egzekwują dwa mechanizmy:

- **Baza danych.** Częściowe indeksy unikalne dopuszczają najwyżej jeden przebieg oczekujący i najwyżej jeden trwający na zakres.
- **pg-boss.** Kolejka pilnuje jednego aktywnego przebiegu na źródło (grupy zadań, zadanie 0mq.16). Unikalności oczekującego przebiegu nie powielamy w kolejce.

Przyjęcie najpierw wstawia przebieg z `ON CONFLICT DO NOTHING`, a zadanie wysyła dopiero po udanym wstawieniu, w tej samej transakcji. Uzasadnienie:

- równoczesne przyjęcia rozstrzyga indeks, bez blokad i bez SAVEPOINT;
- zadanie kolejki nie powstaje bez przebiegu;
- obecny schemat już używa indeksu unikalnego w tym celu, ale zabrania stanu "trwający i oczekujący", którego wymaga F2-07.

Odrzucona alternatywa: `singletonKey` z polityką `stately` i wyszukanie istniejącego przebiegu, gdy pg-boss odrzuci duplikat. Uzależniało to stan przebiegów od stanu kolejki, a polityka `stately` z kluczem na źródło i zakres nie zapewnia jednego aktywnego przebiegu na źródło, więc i tak wymagała grup zadań.

### Migracja

Nowa migracja zastępuje indeks unikalny przebiegów aktywnych (statusy oczekujący i trwający łącznie) dwoma częściowymi indeksami unikalnymi na zakresie: osobno dla statusu oczekującego i dla trwającego. Słownik statusów się nie zmienia; przebieg oczekujący ma dotychczasowy status `queued`.

### Kontrakt operacji

Operacje są wewnętrzne dla modułu Źródła ofert. Przebieg jako obiekt zawiera:
- identyfikatory przebiegu i zakresu,
- źródło i parametry zakresu,
- przyczynę uruchomienia (ręczne albo harmonogram) i dzień harmonogramu,
- status,
- identyfikator zadania kolejki,
- liczniki stron, unikalnych ogłoszeń i wersji,
- błąd i diagnostykę,
- daty utworzenia, rozpoczęcia i zakończenia.

**Przyjęcie** przyjmuje źródło, znormalizowane parametry zakresu, przyczynę, dzień harmonogramu i funkcję wysyłającą zadanie dla danego identyfikatora przebiegu. Ta funkcja korzysta z adaptera pg-boss z zadania 0mq.13 i zwraca identyfikator zadania albo zgłasza błąd. Zwraca identyfikator przebiegu i informację, czy wskazano istniejący. W jednej transakcji kolejno:

1. Upsert zakresu po odcisku parametrów.
2. Wstawienie przebiegu oczekującego z pominięciem konfliktu na indeksie oczekującym.
3. Bez wstawienia: odczyt identyfikatora istniejącego przebiegu oczekującego, bez wysyłania zadania.
4. Po wstawieniu: wysłanie zadania i zapis jego identyfikatora. Błąd wysłania wycofuje całość.

Pozostałe operacje:

- **Rozpoczęcie** to warunkowa zmiana statusu z oczekującego na trwający z datą rozpoczęcia. Gdy warunek nie jest spełniony, operacja zwraca brak przebiegu.
- **Zakończenie** przyjmuje status kompletny, częściowy albo nieudany, błąd i opcjonalną diagnostykę. Zmienia stan tylko przebiegu oczekującego lub trwającego i zwraca, czy zmiana nastąpiła. Status wybiera wywołujący.
- **Odczyt przebiegu** po identyfikatorze, razem z parametrami zakresu.
- **Lista przebiegów niezakończonych**, opcjonalnie dla jednego źródła, od najstarszego.

### Zakres zmian

Zadanie dostarcza migrację, operacje i testy, ale nie przełącza na nie dotychczasowych ścieżek (A3-R06). Po migracji dotychczasowe ścieżki nadal nie tworzą dwóch aktywnych przebiegów w zakresie, bo sprawdzają aktywny przebieg pod blokadą transakcyjną.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A3-AC01 | Test według T-03: dziesięć przyjęć w `Promise.all`, każde wysyła zadanie przez adapter pg-boss. Wynik: jeden przebieg oczekujący i jedno zadanie w kolejce. |
| A3-AC02–AC05 | Scenariusze sekwencyjne według T-03; AC05 dodatkowo przez istniejące testy synchronizacji. |

<a id="a4"></a>

## Zadanie 0mq.4 — Zapis porcji

Wymagania: [A4](requirements.md#a4).

### Kontrakt operacji

Zapis porcji jest operacją wewnętrzną modułu Źródła ofert:

- Przyjmuje przebieg (identyfikator przebiegu, identyfikator zakresu, źródło) i listę ogłoszeń w postaci z kontraktu konektora.
- Zwraca podsumowanie: liczbę nowych obserwacji, powtórnych obserwacji i nowych wersji.
- Działa w operacji transakcyjnej z zadania 0mq.13: samodzielnie jako jedna transakcja na porcję, a wywołana w trwającej transakcji jako jej część.

Dla każdego ogłoszenia operacja wykonuje to samo co dzisiejszy zapis porcji:

1. **Upsert ogłoszenia** po parze źródło i identyfikator zewnętrzny. Ustawia:
   - adres,
   - czas ostatniej obserwacji,
   - zakres ostatniej obserwacji,
   - dostępność na dostępną,
   - datę ważności z ogłoszenia.
2. **Obserwacja** w przebiegu, wstawiana z pominięciem konfliktu. Wstawienie oznacza nową obserwację, a konflikt powtórną.
3. **Nowa wersja i jej ustawienie jako bieżącej**, gdy skrót treści różni się od skrótu bieżącej wersji.

Na koniec porcji operacja zwiększa liczniki przebiegu: liczbę stron o 1, liczbę unikalnych ogłoszeń o liczbę nowych obserwacji i liczbę wersji o liczbę nowych wersji. Każdy błąd w porcji wycofuje porcję i jest zgłaszany jako dedykowany błąd zapisu z pierwotnym błędem jako przyczyną.

Pozostałe ustalenia:

- Data ważności jest przepisywana z ogłoszenia jak dziś, więc obserwacja bez daty zapisuje jej brak. Zmiana tej reguły wymagałaby ustalenia pierwszeństwa sygnałów, które nie należy do epiku.
- Obsługa jawnego statusu zamknięcia nie jest potwierdzona dla wszystkich konektorów. Zadanie zachowuje przekazywane informacje i istniejące mapowania. Jeśli wdrożenie wymagałoby nowego mapowania lub rozstrzygnięcia sprzecznych sygnałów, wykonawca kończy zadanie jako zablokowane z pytaniem.
- Model, w którym ogłoszenie jest jednocześnie dostępne i wygasłe (wygaśnięcie wyliczane z daty ważności przy odczycie), zostaje bez zmian.
- Operacja nie zmienia dostępności ogłoszeń spoza porcji.

### Zmiany w dotychczasowych ścieżkach

- Funkcja przyjmująca porcję w dotychczasowych ścieżkach (zadanie 0mq.1) woła nowy zapis porcji, a dotychczasowy zapis zostaje usunięty.
- Nowy zapis korzysta ze wspólnego dostępu do bazy, a nie z połączenia ścieżki, więc testy integracyjne tych ścieżek ustawiają pulę zgodnie z T-03.
- Oznaczanie niewidzianych ogłoszeń w ścieżce SOLID.Jobs (warunek: ostatni zakres obserwacji równy zakresowi przebiegu) zostaje bez zmian do zadania 0mq.7.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A4-AC01–AC08 | Test integracyjny operacji według T-03, na danych z przykładu A/B z wymagań. AC08 wymusza błąd naruszeniem ograniczenia bazy w drugim ogłoszeniu porcji. |
| A4-AC05 | Dodatkowo istniejący test wygaśnięcia w module Oferty. |
| A4-AC09 | Istniejące testy integracyjne ścieżek SOLID.Jobs i Himalayas. |

<a id="a5"></a>

## Zadanie 0mq.5 — Wspólny wykonawca przebiegu

Wymagania: [A5](requirements.md#a5).

### Przebieg wykonania

Wykonawca jest operacją modułu Źródła ofert wywoływaną z handlera kolejki z identyfikatorem przebiegu, numerem próby zadania (`retryCount` pg-boss) i sygnałem przerwania zadania. Kolejno:

1. **Przejęcie z tokenem.** Warunkowa zmiana stanu przebiegu w jednym zapytaniu:
   - z oczekującego na trwający, z zapisem numeru próby;
   - albo, gdy przebieg już trwa, ma to samo zadanie kolejki i niższy zapisany numer próby, na trwający z nowym numerem próby. To ponowna próba tego samego przebiegu (F2-13).

   W innym przypadku wykonawca kończy pracę bez zmian (ponowne dostarczenie, przebieg zakończony).
2. **Konektor.** Wykonawca pobiera konektor z rejestru po nazwie źródła przebiegu. Nieznana nazwa albo błąd walidacji ustawień przez konektor kończy przebieg jako nieudany z komunikatem błędu konektora lub komunikatem ogólnym (A5-R04).
3. **Pobranie** z parametrami zakresu zapisanymi przy przyjęciu i z sygnałem zadania. Funkcja przyjmująca porcję wywołuje zapis porcji ([0mq.4](#a4)) w transakcji, która najpierw sprawdza token: numer próby przebiegu równy numerowi tej próby, przebieg trwający. Niezgodność przerywa zapis błędem utraty przebiegu, a wykonawca kończy się bez dalszych zapisów.
4. **Zakończenie.** Rezultat kompletny i brak błędów zapisu prowadzą do jednej transakcji: sprawdzenie tokenu, ocena dostępności ([0mq.7](#a7); do tego czasu dotychczasowa reguła SOLID.Jobs dla konektorów z deklaracją wnioskowania z braku), zakończenie ze statusem kompletnym. W innym przypadku zakończenie ze statusem częściowym, gdy przebieg ma co najmniej jedno unikalne ogłoszenie, albo nieudanym, z powodem rezultatu, komunikatem błędu konektora lub komunikatem ogólnym. Zakończenie także sprawdza token.
5. **Błąd przerwania** (sygnał przerwany) i błąd utraty przebiegu kończą handler bez zapisów; o dalszym losie zadania decyduje pg-boss.

### Kolejka i odzyskiwanie

- Zadania przebiegów mają `heartbeatSeconds` 30, `retryLimit` 2 i `expireInSeconds` 3600. Obsługa kolejki odświeża heartbeat automatycznie. Utrata workera kończy heartbeat, a pg-boss ponawia zadanie (ponowna próba przejmuje przebieg z wyższym numerem próby) albo po wyczerpaniu prób oznacza je jako nieudane.
- Odzyskiwanie (start workera i cykl harmonogramu co 60 s) przegląda przebiegi niezakończone. Przebieg, którego zadanie kolejki nie istnieje albo jest w stanie końcowym (`completed`, `failed`, `cancelled`), kończy jako częściowy albo nieudany (według liczby unikalnych ogłoszeń) z komunikatem o przerwaniu. Odzyskiwanie używa warunkowych zmian stanu, bez blokad sesyjnych, więc może działać w kilku workerach naraz.
- Migracja dodaje do przebiegu numer próby (liczba całkowita, domyślnie brak).

### Zmiany w dotychczasowych ścieżkach

- Handlery wszystkich dotychczasowych kolejek źródeł wywołują wspólnego wykonawcę. Dotychczasowe funkcje wykonania i odzyskiwania czterech ścieżek oraz ich blokady sesyjne zostają usunięte.
- Dotychczasowe zlecanie zostaje (zastąpi je zadanie 0mq.16), z opcjami zadań z punktu "Kolejka i odzyskiwanie" zamiast obecnych (`retryLimit` 0). Kolejki są tworzone z tymi opcjami przy inicjalizacji. Jeden aktywny przebieg na źródło zapewniają do zadania 0mq.16 kolejki osobne dla źródeł i dotychczasowe reguły zlecania przy jednym workerze wdrożenia.
- Himalayas: CLI tworzy przebieg dotychczasowym sposobem i wywołuje wspólnego wykonawcę w swoim procesie, z sygnałem przerwanym przy zakończeniu procesu.
- Zmiany stanu przebiegu w nowym kodzie przechodzą przez operacje z [0mq.3](#a3), rozszerzone o token.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A5-AC01–AC05 | Test integracyjny według T-03 z symulowanymi konektorami zarejestrowanymi w rejestrze testowym. |
| A5-AC06–AC09 | Test z rzeczywistą kolejką: worker A przejmuje przebieg i zostaje zatrzymany bez zakończenia zadania (symulacja utraty); po wygaśnięciu heartbeat worker B ponawia próbę; zapisy A po utracie są odrzucane; liczba ogłoszeń i przebiegów się zgadza. Ponowne dostarczenie zakończonego przebiegu nie zmienia stanu. Dla AC09 przebieg trwający z zadaniem w stanie końcowym. Wartość heartbeat w teście może być minimalna (10 s). |
| A5-AC10, AC11 | Istniejące testy integracyjne ścieżek synchronizacji, uzupełnione o wykonanie przez wspólnego wykonawcę. |

<a id="a16"></a>

## Zadanie 0mq.16 — Wspólne zlecanie i kolejka

Wymagania: [A16](requirements.md#a16).

### Kolejka

- Jedna kolejka synchronizacji źródeł z polityką `standard`, `heartbeatSeconds` 30, `retryLimit` 2 i `expireInSeconds` 3600, tworzona przy inicjalizacji kolejek. Dotychczasowe kolejki źródeł są usuwane z inicjalizacji i obsługi workera.
- Zadanie przebiegu ma grupę o identyfikatorze równym nazwie źródła. Obsługa kolejki w workerze ma `groupConcurrency` 1, więc w całym systemie jedno źródło wykonuje naraz jeden przebieg, a różne źródła równolegle (`localConcurrency` równe liczbie zarejestrowanych źródeł).

### Operacja zlecenia

Publiczna operacja modułu Źródła ofert przyjmuje nazwę źródła, wejście zakresu specyficzne dla źródła i przyczynę uruchomienia. Kolejno:
1. konektor z rejestru (nieznane źródło: błąd dla wywołującego, bez przebiegu);
2. sprawdzenie, czy źródło jest włączone (jak dotąd);
3. parametry zakresu z konektora;
4. przyjęcie przebiegu ([0mq.3](#a3)) z wysłaniem zadania do kolejki w tej samej transakcji.

Zwraca identyfikator przebiegu i informację, czy wskazano istniejący.

### Harmonogram

- Wystąpienie harmonogramu identyfikuje para: źródło z harmonogramem (dziś SOLID.Jobs) i dzień harmonogramu wyliczany jak dotąd z konfigurowanej godziny harmonogramu w strefie Europe/Warsaw.
- Przed zleceniem harmonogram sprawdza, czy istnieje przebieg z przyczyną harmonogramową dla tego zakresu i dnia; jeśli tak, nie zleca. Przebiegi ręczne nie są brane pod uwagę.
- Sprawdzenie i zlecenie wykonują się w jednej transakcji z blokadą transakcyjną na wystąpienie, więc równoległe cykle harmonogramu w kilku workerach tworzą jedno zlecenie.

### Wejścia

- Skrypty CLI synchronizacji wszystkich źródeł, w tym Himalayas, zlecają przez operację zlecenia. Z opcją oczekiwania odpytują stan przebiegu co 1 s bez limitu czasu do stanu końcowego. Kod wyjścia: 0 dla kompletnego, 1 dla częściowego i nieudanego. Przerwanie skryptu nie zmienia przebiegu.
- Trasa API zlecenia polskiego portalu korzysta z operacji zlecenia, z dotychczasową walidacją i kodami odpowiedzi.
- Publiczne operacje odczytu: stan przebiegu (po identyfikatorze albo ostatni dla zakresu) z ostatnim kompletnym przebiegiem oraz stan katalogu źródeł (dotychczasowe dane katalogu JobSpy i polskich portali). Trasy i skrypty statusu korzystają z nich i zachowują dotychczasową postać odpowiedzi.

### Wdrożenie

Odzyskiwanie z [0mq.5](#a5) kończy przebiegi, których zadania są w dotychczasowych kolejkach, bo zadanie nie istnieje w nowej kolejce albo jego kolejka nie ma obsługi. Komunikat o przerwaniu prosi o ponowne zlecenie.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A16-AC01, AC02, AC06 | Test integracyjny według T-03: równoległe zlecenia przez operację zlecenia. |
| A16-AC03 | Test z dwoma instancjami pg-boss obsługującymi tę samą kolejkę i symulowanymi konektorami, które rejestrują czasy rozpoczęcia i końca. |
| A16-AC04 | Test harmonogramu z ustalonym zegarem i dwoma równoległymi cyklami. |
| A16-AC05, AC07 | Test operacji i uruchomienie skryptu CLI na izolowanym schemacie z symulowanym konektorem. |
| A16-AC08 | Istniejące testy tras. |
| A16-AC09 | Test odzyskiwania z przebiegiem, którego zadanie leży w dotychczasowej kolejce. |

<a id="a7"></a>

## Zadanie 0mq.7 — Reguła niedostępności

Wymagania: [A7](requirements.md#a7).

- Operacja modułu Źródła ofert wywoływana przez wykonawcę ([0mq.5](#a5)) w transakcji zakończenia, z kontekstem: źródło, zakres, przebieg i deklaracja wnioskowania z braku konektora. Gdy deklaracja nie dopuszcza wnioskowania, operacja nic nie robi.
- Kandydaci: ogłoszenia źródła, dla których istnieje obserwacja w dowolnym wcześniejszym przebiegu tego zakresu, a nie ma obserwacji w bieżącym przebiegu. Ogłoszenia te stają się niedostępne. Ostatni zakres obserwacji nie jest używany w warunku.
- Dotychczasowy warunek po ostatnim zakresie obserwacji w wykonawcy zostaje usunięty.
- Jeśli plan zapytania tego wymaga, migracja dodaje indeks relacji obserwacji po ogłoszeniu.

### Weryfikacja

Test integracyjny według T-03 dla A7-AC01–AC05, z przebiegami wykonywanymi przez wspólnego wykonawcę i symulowany konektor z deklaracją wnioskowania oraz bez niej. AC03 wymusza błąd w transakcji zakończenia.

<a id="a8"></a>

## Zadanie 0mq.8 — Moduł Oferty

Wymagania: [A8](requirements.md#a8).

- Do modułu Oferty trafia logika listy i szczegółów: parsowanie filtrów, filtrowanie, sortowanie, paginacja, dopasowanie wynagrodzeń, budowa opcji filtrów i testy jednostkowe tej logiki. Publiczne wejście modułu eksportuje operacje listy (z filtrami i stroną) i szczegółów oraz typy odpowiedzi.
- Trasy API ofert przekazują zapytanie do operacji modułu i zwracają wynik bez własnej logiki. Składanie odpowiedzi listy ze stanem synchronizacji i dopasowania pozostaje w trasie do zadań 0mq.6, 0mq.16 i 0mq.18.
- Funkcje używane przez widoki (np. budowa zapytania filtrów formularza) pozostają dostępne dla widoków przez publiczne wejście modułu.
- Projekcja treści ogłoszenia i bezpośrednie odczyty danych Źródeł przechodzą do modułu bez zmian; zadanie 0mq.6 zastępuje je kontraktem Źródeł.
- Opis modułu powstaje na końcu zadania, po uporządkowaniu kodu i sprawdzeniu testów.

### Weryfikacja

Istniejące testy ofert (jednostkowe i integracyjne) przeniesione do modułu lub zostawione jako przekrojowe, bez zmiany asercji.

<a id="a6"></a>

## Zadanie 0mq.6 — Kontrakt odczytu ogłoszeń

Wymagania: [A6](requirements.md#a6).

### Decyzja: tłumaczenie treści należy do Źródeł

Treść ogłoszenia jest zapisywana w postaci ze źródła, bo od niej liczony jest skrót wersji (A1-R05). Tłumaczenie na ujednoliconą postać wykonuje więc odczyt Źródeł, a nie zapis. Dotychczasowa projekcja treści z modułu Oferty przechodzi do Źródeł jako część kontraktu odczytu, razem z oceną kwalifikacji pracy zdalnej i nazwą źródła z katalogów. Wygaśnięcie (data ważności przed chwilą odczytu) jest wyliczane w odczycie jak dotąd.

### Kontrakt odczytu

Publiczne operacje modułu Źródła ofert:

- **Odczyt aktualnych ogłoszeń** po liście identyfikatorów, jednym zapytaniem; brakujące identyfikatory są pomijane. Wariant bez listy zwraca katalog do dotychczasowego limitu 10 000 ogłoszeń i zgłasza ten sam błąd po jego przekroczeniu.
- **Odczyt wskazanych wersji** po liście identyfikatorów wersji.
- **Lista wersji ogłoszenia**: identyfikator i data, od najnowszej.
- **Bieżące wersje** po liście identyfikatorów ogłoszeń: identyfikator ogłoszenia i bieżącej wersji (dla aktualności ocen i powiązań firm).

Ogłoszenie w odpowiedzi ma identyfikator, identyfikator bieżącej wersji, pola z A6-R02 w dotychczasowych typach i znaczeniach projekcji oraz daty pierwszej i ostatniej obserwacji. Odczyt wersji zwraca te same pola dla treści tej wersji. Odczyty nie zakładają blokad wierszy.

### Konsumenci

- **Oferty**: lista i szczegóły z odczytu aktualnych ogłoszeń i listy wersji.
- **Dopasowanie**:
  - wejście oceny z odczytu wskazanej wersji. Ocena pobiera najpierw bieżącą wersję, potem jej treść, i zapisuje tę wersję (A6-R04);
  - aktualność ocen z bieżących wersji;
  - lista dopasowań z odczytu zbiorczego.

  Złączenia SQL z tabelami Źródeł znikają.
- **Firmy**:
  - ogłoszenia powiązane z firmą przez odczyt zbiorczy,
  - tytuły w historii powiązań przez odczyt wersji,
  - nazwa firmy z ogłoszenia przez odczyt aktualnego ogłoszenia,
  - powiązanie z bieżącej wersji bez `FOR SHARE`.

  Blokada transakcyjna na ogłoszenie przy powiązaniu zostaje (A6-R05).

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A6-AC01 | Test integracyjny operacji odczytu według T-03. |
| A6-AC02 | Istniejące testy ofert, dopasowania i firm; porównanie projekcji przed i po na danych testowych. |
| A6-AC03 | Test integracyjny: zmiana treści ogłoszenia między pobraniem bieżącej wersji a zapisem oceny. |
| A6-AC04 | Przeszukanie kodu Ofert, Dopasowania i Firm pod kątem tabel Źródeł i importów wnętrza Źródeł. |
| A6-AC05 | Test z licznikiem zapytań puli dla listy ofert z ocenami. |

<a id="a10"></a>

## Zadanie 0mq.10 — Publiczny odczyt Profilu

Wymagania: [A10](requirements.md#a10).

- Publiczne operacje Profilu:
  - **Odczyt aktywnej wersji:** identyfikator i dane wersji albo jawny wynik "brak aktywnej wersji".
  - **Odczyt wskazanych wersji** po liście identyfikatorów, jednym zapytaniem.
  - **Metadane wersji zbiorczo:** identyfikator, data zatwierdzenia i numer wersji. Odczyty nie zakładają blokad.
- Dopasowanie zastępuje złączenia SQL z danymi Profilu wywołaniami tych operacji:
  - **Aktualność ocen:** Dopasowanie pobiera identyfikator aktywnej wersji raz na operację i porównuje go w swoim zapytaniu z wersją zapisaną przy ocenie.
  - **Zlecenie grupy:** odczyt aktywnej wersji raz na grupę i przekazanie tej wersji wszystkim pozycjom.
- Odczyt przy publikacji oceny ze złączeniem profilu i ogłoszenia oraz `FOR SHARE` zostaje rozdzielony:
  - profil czyta się przez odczyt aktywnej wersji, bez blokady;
  - ogłoszenie czyta się bez blokady wiersza profilu, a do czasu zadania 0mq.6 dotychczasowym zapytaniem Dopasowania.
- Reguła aktualności oceny zostaje w Dopasowaniu.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A10-AC01 | Test integracyjny operacji według T-03. |
| A10-AC02 | Istniejące testy dopasowania. |
| A10-AC03, AC04 | Testy integracyjne z równoległym zatwierdzeniem profilu, uruchomionym przez `Promise.all` w trakcie zlecenia grupy i publikacji oceny. |
| A10-AC05 | Przeszukanie kodu Dopasowania pod kątem tabel Profilu. |

<a id="a14"></a>

## Zadanie 0mq.14 — Moduł AI

Wymagania: [A14](requirements.md#a14). Zakres F4: [F4](requirements.md#f4). Etap 1: [requirements](../lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md), [SD](../lokalne-ai/etapy/01-konfiguracja-budzet/solution-design.md).

### Decyzje

1. **Warstwy.** Moduł AI ma trzy warstwy:
   - **Publiczne wejście** z kontraktem ogólnym.
   - **Koordynację:** stan wykonania i prób, kolejka wykonania, budżet, rozliczenie, wspólny slot lokalny, ponowienia i odzyskiwanie.
   - **Adaptery dostawców.**

   Klient zależy tylko od publicznego wejścia, a koordynacja tylko od kontraktu adaptera.
2. **Zlecenie wykonania.** Zlecenie działa w transakcji klienta (wspólny mechanizm z 0mq.13) i przyjmuje:
   - typ zadania: dotychczasowy klucz konfiguracji i cennika,
   - identyfikator operacji domenowej i opcjonalną wersję wejścia,
   - sposób wykonania: pojedyncze, pozycja wsadu z identyfikatorem grupy albo praca agentowa,
   - instrukcję, schemat odpowiedzi i wejście.

   Utrwala migawkę konfiguracji i cennika, rezerwuje budżet według dotychczasowych reguł (albo zapisuje oczekiwanie na budżet) i wysyła zadanie do kolejki wykonania AI w tej samej transakcji. Zwraca identyfikator wykonania i stan początkowy. Dla grupy rezerwacja obejmuje całą grupę albo nic.
3. **Jedno aktywne wykonanie na operację.** Moduł AI pilnuje, że dana operacja domenowa ma najwyżej jedno wykonanie w toku. Regułę egzekwuje indeks częściowy na danych wykonań. Zastępuje to dotychczasową regułę jednej próby w toku na import w danych Profilu; migrację wykonuje zadanie 0mq.9.
4. **Odbiorca wyniku.** Klient rejestruje dla typu zadania odbiorcę wyniku: kontrakt zdefiniowany przez AI, implementowany przez warstwę integrującą klienta. Rejestracja odbywa się w miejscu składania zależności (worker, serwer). Odbiorca jest wywoływany w jednym z dwóch przypadków:
   - **Wynik zgodny ze schematem:** AI przekazuje identyfikator operacji, wersję wejścia, wynik i informacje o koszcie. Odbiorca zwraca decyzję "przyjęty" albo "odrzucony z powodem".
   - **Stan końcowy bez wyniku:** AI przekazuje przyczynę.

   AI wywołuje odbiorcę w transakcji, w której zapisuje rozliczenie. Publikacja klienta i rozliczenie zatwierdzają się więc razem. Koszt jest rozliczany niezależnie od decyzji odbiorcy; nieznany koszt pozostaje zarezerwowany.
5. **Kontrakt adaptera.** Adapter deklaruje obsługiwane sposoby wykonania:
   - **Pojedyncze:** żądanie, wynik i użycie, z błędami sklasyfikowanymi jak dotychczasowe błędy modelu.
   - **Wsadowe:** utworzenie partii z identyfikatorami pozycji, odpytanie stanu, pobranie wyników per pozycja i sprzątanie. Zawiera rozróżnienie braku pliku wynikowego od poprawnego wyniku oraz stan niepewny po wysłaniu.
   - **Agentowe:** uruchomienie pracy z dozwolonymi narzędziami, wynik, materiały i użycie każdego kroku.

   Koszt liczy koordynacja z użycia i migawki cennika. Dotychczasowe adaptery OpenAI (pojedyncze wywołanie) i Ollama trafiają do modułu jako adaptery trybu pojedynczego. Adapter wsadowy OpenAI i adapter researchu powstają z kodu Dopasowania i Firm w zadaniu 0mq.17.
6. **Konfiguracja i budżet.** Dotychczasowa konfiguracja, ceny, arytmetyka kosztów i budżet miesięczny przechodzą do modułu bez zmiany zachowania (E01). Rezerwacja i rozliczenie działają w bieżącej transakcji.
7. **Odczyty.** Publiczne odczyty AI:
   - **Wykonanie:** stan, wynik, użycie, koszt (zarezerwowany, rzeczywisty, nieznany), przyczyna i historia prób operacji.
   - **Budżet:** limit okresu, kwoty zarezerwowane i rozliczone, środki dostępne.
8. **Przejście.** Do czasu zadań 0mq.9 i 0mq.17 publiczne wejście AI eksportuje też to, czego używają dziś Profil, Dopasowanie i Firmy: konfigurację, budżet i adaptery. Te eksporty są oznaczone jako przejściowe, a zadania 0mq.9 i 0mq.17 je usuwają.
9. **Uproszczenia** (F4) są opisane w opisie modułu AI w sekcji o stanie wdrożenia, z odesłaniem do epiku `oferty-pracy-sq2`.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A14-AC01 | Przegląd publicznego wejścia AI. |
| A14-AC02–AC04 | Test integracyjny według T-03 z symulowanym adapterem i odbiorcą testowym. AC04: odbiorca odrzuca wynik, a koszt jest rozliczony; adapter nie zwraca użycia, a koszt zostaje zarezerwowany. |
| A14-AC05 | Testy z SD etapu 1 i istniejące testy konfiguracji i budżetu. |
| A14-AC06 | Przegląd opisu modułu. |
| A14-AC07 | Przegląd zależności koordynacji, adapterów i publicznego wejścia AI. |

<a id="a9"></a>

## Zadanie 0mq.9 — Profil przez kontrakt AI

Wymagania: [A9](requirements.md#a9). Etap 2: [requirements](../lokalne-ai/etapy/02-profil-adapter/requirements.md), [SD](../lokalne-ai/etapy/02-profil-adapter/solution-design.md).

- **Warstwa integrująca Profilu** leży w adapterach modułu Profil. Przejmuje dotychczasowe budowanie instrukcji i schematu propozycji oraz parsowanie wyniku. Zleca wykonanie typu "profil" przez kontrakt AI i jest odbiorcą wyniku tego typu.
- **Odbiorca wyniku:**
  - Dla wyniku wywołuje operację Profilu, która sprawdza rewizję tekstu i cytaty i zapisuje propozycję w danych importu.
  - Dla stanu końcowego bez wyniku ustawia stan importu z dotychczasowymi komunikatami, np. "przerwano przygotowanie propozycji; koszt pozostaje zarezerwowany".
- **Ścieżki wykonania:**
  - Płatna ścieżka korzysta z adaptera OpenAI trybu pojedynczego.
  - Lokalna ścieżka korzysta z adaptera Ollama, wspólnego slotu lokalnego i dotychczasowego mechanizmu wykonań lokalnych; przechodzą one do koordynacji AI.
  - Dotychczasowa kolejka zadań AI Profilu i jej obsługa w workerze przechodzą do modułu AI.
- **Migracja danych prób AI:**
  - Dodaje ogólne pola: identyfikator operacji, wersja wejścia i wynik wykonania.
  - Wypełnia je z dotychczasowych pól importu, rewizji tekstu i propozycji.
  - Zastępuje indeks jednej próby w toku na import indeksem jednego wykonania w toku na operację (decyzja 3 z 0mq.14).

  Dotychczasowe pola specyficzne dla Profilu stają się opcjonalne i nie są używane przez nowy kod; ich usunięcie należy do epiku `oferty-pracy-sq2`.
- **Odczyt importu** pokazuje stan przygotowania propozycji z odczytu wykonania AI.
- **Eksporty przejściowe.** Profil przestaje korzystać z przejściowych eksportów AI z 0mq.14. Usunięcie eksportów, których nie używają już inne moduły, należy do tego zadania.
- **Opis modułu AI** dostaje sekcję o dodaniu ścieżki wykonania: nowy adapter albo nowy typ zadania z konfiguracją i odbiorcą wyniku.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A9-AC01–AC03 | Testy integracyjne według T-03 z symulowanymi adapterami OpenAI i Ollama, w tym istniejący test lokalnego profilu. |
| A9-AC04 | Istniejące testy profilu i tras profilu. |
| A9-AC05 | Testy z SD etapu 2. |
| A9-AC06 | Przeszukanie kodu Profilu pod kątem tabel AI i importów wnętrza AI. |
| A9-AC07 | Przegląd opisu modułu AI. |

<a id="a11"></a>

## Zadanie 0mq.11 — Trasy Profilu

Wymagania: [A11](requirements.md#a11).

- Publiczne operacje Profilu dla tras:
  - lista i szczegóły importów, z oryginałem pliku i stanem propozycji;
  - odczyt wersji;
  - zastosowanie propozycji: identyfikator importu, rewizja tekstu, wybór pozycji i oczekiwana rewizja szkicu. Wynik to nowy szkic albo dotychczasowe błędy konfliktu.
- Zastosowanie propozycji w jednej transakcji kolejno:
  1. odczytuje propozycję i sprawdza rewizję tekstu,
  2. waliduje wynik,
  3. zapisuje szkic z kontrolą rewizji.
- Podsumowanie budżetu w odpowiedzi profilu pochodzi z publicznego odczytu budżetu AI.
- Trasy tłumaczą żądanie na polecenie, a wynik i błędy na dotychczasowe odpowiedzi i kody.

### Weryfikacja

Istniejące testy tras profilu, w tym testy HTTP na działającej aplikacji. Przeszukanie tras profilu pod kątem zapytań do bazy.

<a id="a17"></a>

## Zadanie 0mq.17 — Dopasowanie i Firmy przez kontrakt AI

Wymagania: [A17](requirements.md#a17). Etapy 3 i 4: [etap 3](../lokalne-ai/etapy/03-oceny-batch/solution-design.md), [etap 4](../lokalne-ai/etapy/04-research-wykonawca/solution-design.md).

- **Oceny pojedyncze:**
  - Warstwa integrująca Dopasowania buduje instrukcję i schemat oceny tak jak dziś i zleca wykonanie typu "dopasowanie" w trybie pojedynczym.
  - Odbiorca wyniku waliduje ocenę (kryteria, dowody względem wersji profilu i ogłoszenia) i publikuje ją albo odrzuca.
  - Dotychczasowa kolejka ocen i jej obsługa przechodzą do AI.
- **Grupy ocen:**
  - Zlecenie grupy rezerwuje budżet całej grupy albo nic i tworzy pozycje wsadu z identyfikatorami równymi dotychczasowym `custom_id`.
  - Dotychczasowy klient OpenAI Batch przechodzi do AI jako adapter trybu wsadowego, razem z cyklem wysłania, odpytania, odbioru i sprzątania partii.
  - Wyniki per pozycja trafiają do odbiorcy niezależnie; wynik poza kolejnością trafia do właściwej pozycji.
  - Stan niepewny po wysłaniu partii blokuje automatyczne utworzenie kolejnej płatnej partii.
  - Archiwum diagnostyczne partii jest zapisywane przez adapter. Istniejąca tabela archiwum przechodzi pod własność AI bez zmiany schematu, a widok archiwum odczytuje je przez publiczny odczyt AI.
- **Research firm:**
  - Dotychczasowy dostawca researchu (wyszukiwanie WWW i synteza w OpenAI) przechodzi do AI jako adapter trybu agentowego. Raportuje użycie i koszt każdego kroku osobno, więc błąd syntezy nie zeruje kosztu wyszukiwania.
  - Firmy przygotowują cel researchu i są odbiorcą wyniku: walidują źródła, cytaty i pokrycie, a raport publikują albo odrzucają. Ponowne użycie istniejącego raportu i jawne odświeżenie zostają w Firmach.
  - Dotychczasowa kolejka researchu przechodzi do AI.
- **Odzyskiwanie:** restart przy nieznanym skutku płatnej pracy nie uruchamia nowego wyszukiwania ani partii; wykonanie trafia do stanu niepewnego jak dziś.
- **Dane i eksporty:** Dopasowanie i Firmy zachowują powiązanie swoich rekordów z wykonaniem przez identyfikator (klucz obcy jest zależnością schematu). Przejściowe eksporty AI z 0mq.14 zostają usunięte.

### Weryfikacja

| Kryterium | Sprawdzenie |
| --- | --- |
| A17-AC01 | Istniejące testy dopasowania, grup, archiwum, firm i researchu. |
| A17-AC02, AC03 | Testy z SD etapów 3 i 4. |
| A17-AC04 | Przeszukanie kodu Dopasowania i Firm pod kątem tabel AI i importów wnętrza AI. |

<a id="a18"></a>

## Zadanie 0mq.18 — Neutralne mechanizmy

Wymagania: [A18](requirements.md#a18).

- **Transakcje.** Dotychczasowe pomocnicze transakcje (Źródeł, Profilu i ręczne `BEGIN` w Firmach) są zastąpione operacją transakcyjną z 0mq.13. Granice transakcji zostają takie same, a blokady transakcyjne pozostają.
- **Wspólny kod tras** przechodzi do neutralnego narzędzia serwera; trasy Dopasowania, Firm i Źródeł korzystają z niego zamiast z narzędzi Profilu. Obejmuje:
  - walidację UUID,
  - limit i parsowanie treści żądania,
  - obsługę wyjątków na kody odpowiedzi,
  - dostęp do klienta pg-boss.
- **Usuwanie danych kontaktowych** z tekstu przechodzi do wspólnej infrastruktury jako czysta funkcja, z której korzystają Profil i Dopasowanie.
- **Dane profilu w Dopasowaniu i Firmach.** Dopasowanie korzysta z typów danych profilu eksportowanych przez publiczne wejście Profilu i z odczytu z 0mq.10. Nie korzysta z wewnętrznych schematów walidacji Profilu; potrzebna walidacja wejścia oceny należy do Dopasowania.

### Weryfikacja

Przeszukanie importów modułów Dopasowanie, Firmy i Źródła oraz ich tras pod kątem wnętrza Profilu i pomocniczych transakcji. Istniejące testy z A18-AC03.

<a id="a12"></a>

## Zadanie 0mq.12 — Docelowe katalogi

Wymagania: [A12](requirements.md#a12).

- Zadanie przenosi do modułów kod pozostały po wcześniejszych zadaniach, uzupełnia brakujące publiczne wejścia i opisy, porządkuje warstwy według katalogu modułu (operacje, domena, persystencja, adaptery, obsługa tras, kolejek i CLI) i dostosowuje importy.
- Pliki, które zostają poza modułami (T-01), delegują do publicznych wejść.
- Widoki importujące dziś kod modułów (np. katalog polskich portali, etykiety kwalifikacji pracy zdalnej) korzystają z publicznych wejść modułów.
- Wynik zadania zawiera listę plików poza modułami z powodem.

### Weryfikacja

Przegląd struktury i importów; pełne kontrole jakości (W-AC01).
