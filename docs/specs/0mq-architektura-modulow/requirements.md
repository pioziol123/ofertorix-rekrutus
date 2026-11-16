# Architektura modułów — Requirements

Podstawa: [PRD](PRD.md). Rozwiązanie techniczne: [solution-design.md](solution-design.md). Pojęcia: [słownik domeny](../../../GLOSSARY.md), [Źródła ofert](../../../modules/sources/README.md), [mapa modułów](../../architecture/moduly.md).

Sekcja `A<n>` opisuje zadanie Beads `oferty-pracy-0mq.<n>`. Identyfikatory wymagań (`A<n>-R..`) i kryteriów (`A<n>-AC..`) są stabilne, a zadanie w Beads cytuje kryteria po ID. Kolumna *Sprawdzenie* mówi, czym wykonawca dowodzi spełnienia kryterium.

<a id="wymagania-wspolne"></a>

## Kryteria wspólne

Obowiązują każde zadanie epiku i są cytowane w każdym z nich.

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| W-AC01 | Wszystkie automatyczne kontrole jakości projektu przechodzą: reguły i formatowanie kodu, typy, budowanie aplikacji oraz testy automatyczne razem z testami na rzeczywistej bazie danych. | Pełne uruchomienie kontroli jakości |
| W-AC02 | Działanie aplikacji nie zmienia się poza zmianami opisanymi w wymaganiach zadania. Istniejące testy po zmianie sprawdzają to samo zachowanie. Test usuwa się lub osłabia tylko wtedy, gdy zadanie celowo zmienia sprawdzane zachowanie; wynik zadania wskazuje każdy taki test i powód. | Przegląd zmian w testach |
| W-AC03 | Kod tworzony lub przenoszony w zadaniu należy do modułu, który jest właścicielem jego danych i reguł, i korzysta z innych modułów wyłącznie przez ich publiczne operacje, zgodnie z [zasadami architektury](../../architecture/moduly-i-zasady-kodu.md). | Przegląd kodu |

<a id="f2"></a>

## Reguły synchronizacji źródeł (F2)

Decyzje właściciela dla procesu synchronizacji. Zadania 0mq.1–0mq.5, 0mq.16 i 0mq.7 realizują ich części; każde zadanie wskazuje swoje reguły.

| Reguła | Treść |
| --- | --- |
| F2-01 | **Konektor.** Każde źródło jest obsługiwane przez konektor o wspólnym kontrakcie. Konektor odpowiada za komunikację ze źródłem, podział wyników na porcje i ocenę, czy sprawdził cały zakres. Wspólny proces synchronizacji nie zależy od szczegółów żadnego źródła. |
| F2-02 | **Porcje.** Wyniki zapisują się w miarę otrzymywania. Porcja zawiera rzeczywiste ogłoszenia, a jej wielkość nie jest określona: trzy porcje po 100 ogłoszeń i jedna porcja 300 są równoważne. Zapisane porcje zostają po późniejszym błędzie. |
| F2-03 | **Duplikaty.** Powtórzone ogłoszenie, w porcji lub między porcjami, nie przerywa pobierania ani zapisu. Nie rozstrzygamy, która treść duplikatu zostanie zapisana. Źródło może nadal uznać taki przebieg za niekompletny. |
| F2-04 | **Rezultat.** O tym, czy cały zakres został sprawdzony, decyduje źródło według swoich dotychczasowych kryteriów. Ujednolicenie tych kryteriów nie należy do epiku. Synchronizacja nie jest kompletna, jeśli zapis wyników się nie powiódł. |
| F2-05 | **Czas oczekiwania.** Pojedyncze zapytanie konektora do źródła czeka na odpowiedź najwyżej 5 s. Zapytanie nieudane z przyczyny przejściowej jest ponawiane najwyżej dwa razy. Ponowienie zapytania nie jest ponowieniem przebiegu. Źródła pobierane przez zewnętrzne narzędzia pomocnicze (JobSpy, polskie portale) zachowują obecne limity czasu (decyzja właściciela z 2026-11-15); ewentualne odstępstwa ocenimy osobno. |
| F2-06 | **Jeden aktywny przebieg na źródło.** Jedno źródło wykonuje naraz najwyżej jeden przebieg, niezależnie od zakresu. Pozostałe czekają w kolejności zlecenia. Różne źródła działają równolegle. Nowe zlecenie nie przerywa trwającego przebiegu. |
| F2-07 | **Jeden oczekujący na źródło i zakres.** Jeśli to samo źródło i zakres mają przebieg oczekujący, kolejne zlecenie nie tworzy nowego i dostaje identyfikator oczekującego. Jeśli trwa przebieg, a oczekującego nie ma, zlecenie tworzy jeden oczekujący. Reguła dotyczy przebiegów aktywnych; historia zakończonych przebiegów jest nieograniczona. Przykład: dla źródła S i zakresu PHP trwa przebieg A. Pierwsze zlecenie tworzy oczekujący B, a kolejne wskazują B. Zakres Java dostaje własny oczekujący, ale nie wykona się równolegle z A. Po starcie B można zlecić kolejny przebieg PHP. |
| F2-08 | **Zakres.** Zakres to źródło i parametry określające zbiór pobieranych ogłoszeń. Kolejność równoważnych filtrów i sposób uruchomienia nie tworzą innego zakresu. Ustawienia przebiegu są ustalane w chwili zlecenia, a ich późniejsza zmiana nie wpływa na przyjęty przebieg. Zmiana limitu wyników zachowuje obecne znaczenie: oznacza inny zakres. |
| F2-09 | **Bez ograniczeń czasowych.** Ponowne pobranie tego samego dnia jest dozwolone, a oczekujący przebieg nie wygasa z powodu czasu w kolejce. Jedno wystąpienie harmonogramu tworzy jedno zlecenie; dodatkowe zlecenia podlegają F2-07. |
| F2-10 | **Sposoby uruchomienia.** CLI, aplikacja i harmonogram zlecają synchronizację tą samą operacją i korzystają z tego samego wykonania. Aplikacja i harmonogram dostają identyfikator przebiegu bez czekania na wynik. CLI czeka na wynik swojego przebiegu bez osobnego limitu czasu; gdy zlecenie wskazało istniejący oczekujący przebieg, czeka na niego. Przerwanie oczekiwania nie anuluje przebiegu. |
| F2-11 | **Błędy konfiguracji.** Nieznane źródło albo błędne ustawienia przebiegu kończą przebieg zapisanym błędem. Dwa źródła o tej samej nazwie są błędem konfiguracji, który uniemożliwia start aplikacji. |
| F2-12 | **Obserwacje i dostępność.** System pamięta, w których przebiegach widziano każde ogłoszenie, a przez nie w których zakresach. Zasady dostępności ([F1](../../../modules/sources/README.md#jak-ustalana-jest-dostępność)): obserwacja przywraca dostępność od razu; informacje źródła o konkretnym ogłoszeniu są zachowywane; brak ogłoszenia oznacza niedostępność tylko po kompletnym przebiegu źródła, które na to pozwala, i tylko w tym samym zakresie. |
| F2-13 | **Przerwanie pracy.** Jeśli wykonujący przebieg proces przestanie działać, przebieg zostaje wznowiony albo jawnie zakończony, bez duplikowania ogłoszeń. Proces, który utracił przebieg, przestaje zapisywać jego wyniki. Ponowna próba kontynuuje ten sam przebieg zamiast tworzyć nowy. |
| F2-14 | **Poza zakresem:** scalanie identycznych treści pod różnymi identyfikatorami, szczególna obsługa zmian treści A → B → A, wybór właściwej treści duplikatu, przebudowa wersjonowania, wpływ wersji na aktualność dopasowania oraz ujednolicenie źródłowych kryteriów kompletności i jakości danych. |

<a id="f4"></a>

## Zakres obsługi zadań AI (F4)

Dotyczy zadań 0mq.14, 0mq.9, 0mq.11 i 0mq.17.

- Zadania przenoszą istniejącą obsługę zadań AI i zachowują jej obecne działanie. Obejmuje to:
  - historię prób, ponowienia i odzyskiwanie przerwanej próby,
  - współdzielenie lokalnego modelu,
  - rezerwy przy nieznanym koszcie, budżet i rozliczenie kosztu,
  - łączne rozliczenie i publikację wyniku,
  - rozliczenie przy odrzuconej treści,
  - rezerwację grupy zleceń w całości,
  - obsługę wyników przetwarzania wsadowego i researchu po błędzie.

  Działających zabezpieczeń nie usuwa się.
- Zadania nie dodają nowych gwarancji obsługi, odzyskiwania ani rozliczeń. Prostsza koordynacja jest dopuszczalna, jeśli nie pogarsza obecnego działania. Usprawnienia należą do epiku `oferty-pracy-sq2`.
- Brak gwarancji wykryty w trakcie pracy, który nie jest regresją, wykonawca zgłasza jako dalszą pracę i go nie naprawia. Dotyczy to też kryteriów przejętych z etapów 1–4 epiku `oferty-pracy-334`.
- Do czasu zadania `oferty-pracy-0mq.15` zadania w tle poza synchronizacją źródeł nie wykrywają przerwania pracy. To świadomie zaakceptowana zmiana, a nie regresja.

<a id="a13"></a>

## Zadanie 0mq.13 — Operacje kilku modułów zapisują się razem

Wspólny mechanizm dostępu do danych pozwala operacji przypadku użycia objąć zapisy wszystkich modułów, które wywołuje. Zadanie wprowadza mechanizm i zasady. Istniejący kod migrują zadania, które go zmieniają.

| Wymaganie | Treść |
| --- | --- |
| A13-R01 | Operacja przypadku użycia zapisuje się w całości albo wcale. Błąd w dowolnym kroku wycofuje zapisy wszystkich modułów wykonane w jej trakcie, także kroków zakończonych pomyślnie. |
| A13-R02 | Operacja modułu wywołana samodzielnie sama zatwierdza swoje zmiany. Wywołana w trakcie innej operacji staje się jej częścią i nie zatwierdza zmian przed jej końcem. |
| A13-R03 | Równoległe operacje są od siebie niezależne: błąd jednej nie wycofuje zmian drugiej. |
| A13-R04 | Zlecenie pracy w tle jest częścią operacji, która je zleca: wycofanie operacji wycofuje zlecenie. |
| A13-R05 | Błędy operacji nie wyczerpują zasobów bazy danych: po dowolnej liczbie nieudanych operacji system obsługuje kolejne. |
| A13-R06 | Moduły nie zarządzają połączeniami z bazą. Kod modułu nie zależy od tego, czy działa w ramach większej operacji. |
| A13-R07 | Zasady dostępu do danych i granic operacji są opisane w dokumentacji architektury jako obowiązujące dla całego kodu. |
| A13-R08 | Zadanie nie przepisuje istniejących operacji. Robią to zadania, które zmieniają dany kod. |

Decyzje właściciela:

- Odczyt danych innego modułu nie blokuje ich zmiany. Przy publikacji oceny dopasowania akceptujemy, że profil lub ogłoszenie może zmienić się między sprawdzeniem aktualności oceny a jej zapisem. Okno jest bardzo krótkie, a właściciel może ponownie zlecić ocenę.
- Rezygnujemy z mechanizmu, który wykrywał przerwanie pracy procesu w tle. Synchronizacja źródeł odzyskuje tę ochronę w zadaniach 0mq.5 i 0mq.16, pozostałe zadania w tle w zadaniu `0mq.15`. Ochrona przed podwójnym podjęciem tej samej pracy pozostaje.

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A13-AC01 | Operacja A wywołuje operację B i zgłasza błąd po zakończeniu B: zapis B zostaje wycofany. | Test automatyczny na rzeczywistej bazie |
| A13-AC02 | Operacja B wywołana samodzielnie zatwierdza swój zapis. | jw. |
| A13-AC03 | Zmiany operacji wywołanej w trakcie innej są niewidoczne dla pozostałych użytkowników bazy do zakończenia operacji zewnętrznej. | jw. |
| A13-AC04 | Z dwóch równoległych operacji jedna kończy się błędem: zmiany drugiej zostają zatwierdzone. | jw. |
| A13-AC05 | Praca w tle zlecona w wycofanej operacji nie trafia do kolejki; zlecona w zatwierdzonej trafia. | jw., z rzeczywistą kolejką |
| A13-AC06 | Po nieudanych operacjach w liczbie większej niż dopuszczalna liczba równoczesnych połączeń kolejna operacja wykonuje się poprawnie. | jw. |
| A13-AC07 | Dokumentacja architektury opisuje zasady dostępu do danych, granic operacji i decyzje z tej sekcji. | Przegląd dokumentacji |
| A13-AC08 | Zadanie zmienia tylko wspólny mechanizm, sposób jego uruchomienia w aplikacji, workerze i skryptach oraz dokumentację; istniejące operacje modułów zostają bez zmian. | Przegląd zmian |

<a id="a1"></a>

## Zadanie 0mq.1 — Źródła pobierane przez wspólny kontrakt konektora

Każde źródło ofert jest obsługiwane przez konektor o wspólnym kontrakcie, niezależnie od tego, czy źródło udostępnia API, strony HTML czy wymaga narzędzia pomocniczego. Reguły: F2-01–F2-05, F2-08.

| Wymaganie | Treść |
| --- | --- |
| A1-R01 | Każde obsługiwane źródło (SOLID.Jobs, Himalayas, portale JobSpy, polskie portale) ma konektor. Konektor przyjmuje zakres, przekazuje znalezione ogłoszenia w porcjach i zgłasza, czy sprawdził cały zakres, a jeśli nie, z jakiego powodu. |
| A1-R02 | Każde źródło zachowuje dotychczasowe kryteria kompletności, z wyjątkiem A1-R04. |
| A1-R03 | Konektor stosuje limity czasu i ponowień z F2-05. |
| A1-R04 | Powtórzone ogłoszenie nie przerywa pobierania kolejnych porcji. SOLID.Jobs nadal uznaje przebieg z duplikatem za niekompletny, tak jak dziś. |
| A1-R05 | Zapisane dane się nie zmieniają: ogłoszenia mają te same identyfikatory, adresy, daty ważności i treści. Istniejące ogłoszenia nie dostają nowych wersji z powodu refaktoru. |
| A1-R06 | Konektor ustala zakres ze zlecenia zgodnie z F2-08. Dotychczasowe zakresy zachowują tożsamość, więc historia ich przebiegów i obserwacji pozostaje przypisana. |
| A1-R07 | Konektor deklaruje, czy brak ogłoszenia po kompletnym przebiegu pozwala wnioskować o niedostępności. Deklaracja odpowiada obecnemu działaniu: pozwala tylko SOLID.Jobs. |
| A1-R08 | Dotychczasowe uruchamianie synchronizacji pobiera dane przez konektory. Zachowuje zapis przyrostowy, wyniki częściowe, liczniki przebiegu, komunikaty błędów i reguły dostępności. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A1-AC01 | Każde źródło z katalogów SOLID.Jobs, Himalayas, JobSpy i polskich portali ma konektor o wspólnym kontrakcie. | Przegląd kodu |
| A1-AC02 | Zapytanie do źródła bez odpowiedzi kończy się po 5 s. Zapytanie nieudane z przyczyny przejściowej ma najwyżej trzy próby, a nieudane z innej przyczyny jedną. Ponowienia nie tworzą przebiegów. | Test automatyczny z symulowanym źródłem i czasem |
| A1-AC03 | Konektor przekazuje wyniki w wielu porcjach: trzy strony wyników SOLID.Jobs dają trzy porcje ogłoszeń. | Test automatyczny z symulowanym źródłem |
| A1-AC04 | Duplikat w porcji i między porcjami nie przerywa pobierania: wszystkie strony zostają pobrane, a rezultat SOLID.Jobs jest niekompletny. | jw. |
| A1-AC05 | Dla każdego źródła dane wejściowe, które dawały przebieg kompletny, częściowy albo nieudany, dają ten sam status co przed zmianą, poza przypadkiem z A1-AC04. Kryterium wiąże zmianę z tego zadania; od zadania 0mq.5 status ustala A5-R03. | Istniejące testy synchronizacji na rzeczywistej bazie |
| A1-AC06 | Dla tych samych danych wejściowych zapisane ogłoszenia i ich wersje mają te same identyfikatory, adresy, daty ważności, skróty i treści co przed zmianą. | Testy synchronizacji na rzeczywistej bazie |
| A1-AC07 | Domyślne zakresy wszystkich źródeł mają te same odciski co przed zmianą. Dwa zlecenia polskiego portalu różniące się tylko kolejnością parametrów dają ten sam zakres. | Test automatyczny z odciskami policzonymi przed zmianą |
| A1-AC08 | Wnioskowanie z braku jest dopuszczone dla SOLID.Jobs i wyłączone dla pozostałych źródeł. | Test automatyczny |

<a id="a2"></a>

## Zadanie 0mq.2 — Źródło wybierane po stałej nazwie

System odnajduje konektor źródła po stałej nazwie w jednym rejestrze. Reguły: F2-11.

| Wymaganie | Treść |
| --- | --- |
| A2-R01 | Każdy konektor ma stałą, unikalną nazwę, równą dotychczasowemu identyfikatorowi źródła zapisanemu w danych. |
| A2-R02 | Rejestr pozwala odnaleźć konektor po nazwie i podaje listę wszystkich nazw. |
| A2-R03 | Dwa konektory o tej samej nazwie to błąd konfiguracji, który uniemożliwia start aplikacji i workera. Rejestr nie wybiera żadnego z nich. |
| A2-R04 | Nieznana nazwa daje jednoznaczny błąd ze wskazaniem nazwy, który można zapisać jako błąd przebiegu. Zapis należy do zadania 0mq.5. |
| A2-R05 | Dodanie źródła polega na dodaniu konektora i wpisaniu go do rejestru. Pozostała część systemu nie zna konkretnych konektorów. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A2-AC01 | Lista nazw w rejestrze to dokładnie: SOLID.Jobs, Himalayas, wszystkie źródła JobSpy i wszystkie polskie portale, pod dotychczasowymi identyfikatorami. Konektor znaleziony po nazwie ma tę nazwę. | Test automatyczny |
| A2-AC02 | Rejestr z dwoma konektorami o tej samej nazwie nie powstaje; błąd wskazuje nazwę. | jw. |
| A2-AC03 | Wyszukanie nieznanej nazwy daje błąd z tą nazwą, bez innych danych. | jw. |
| A2-AC04 | Konkretne konektory są znane wyłącznie w rejestrze. | Przegląd kodu |

<a id="a3"></a>

## Zadanie 0mq.3 — Stan przebiegu synchronizacji w jednym miejscu

Moduł Źródła ofert prowadzi stan przebiegów w jednym miejscu: przyjęcie, rozpoczęcie, zakończenie i odczyt stanu potrzebnego do odzyskiwania. O przebiegu decyduje kod, który nim zarządza; zadania 0mq.5 i 0mq.16 podłączają do niego wykonanie i zlecanie. Reguły: F2-07, F2-08.

| Wymaganie | Treść |
| --- | --- |
| A3-R01 | Przebieg przechowuje źródło, zakres z ustawieniami, przyczynę uruchomienia, daty, powiązanie ze zleceniem w kolejce, status, liczniki, błąd i diagnostykę. |
| A3-R02 | Przyjęcie przebiegu i jego zlecenie w kolejce powstają razem albo wcale. Przyjęcie stosuje F2-07 także przy równoczesnych zleceniach. |
| A3-R03 | Przebieg rozpoczyna się tylko z oczekiwania. Ponowne dostarczenie tej samej pracy nie rozpoczyna go drugi raz, a przebieg zakończony nie rozpoczyna się ponownie. |
| A3-R04 | Ustawienia przebiegu są ustalane przy przyjęciu i nie zmieniają się później (F2-08). |
| A3-R05 | Zakończenie zapisuje status kompletny, częściowy albo nieudany oraz błąd i diagnostykę. Historia zakończonych przebiegów jest nieograniczona. |
| A3-R06 | W tym zadaniu dotychczasowe zlecanie i wykonanie zachowują obecne reguły. Nowe reguły przyjęcia zaczną obowiązywać w zadaniu 0mq.16. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A3-AC01 | Dziesięć równoczesnych przyjęć tego samego źródła i zakresu daje dokładnie jeden przebieg oczekujący i jedno zlecenie w kolejce; wszystkie przyjęcia zwracają jego identyfikator. Nie ma przebiegów bez zleceń ani zleceń bez przebiegów. | Test automatyczny na rzeczywistej bazie i kolejce |
| A3-AC02 | Przy trwającym przebiegu przyjęcie tworzy jeden oczekujący, a kolejne przyjęcia zwracają jego identyfikator. Zakończone przebiegi zakresu nie wpływają na przyjęcie. | jw. |
| A3-AC03 | Drugie rozpoczęcie tego samego przebiegu i rozpoczęcie przebiegu zakończonego nie zmieniają jego stanu. | jw. |
| A3-AC04 | Przyjęcie z innymi ustawieniami tworzy osobny zakres i nie zmienia ustawień wcześniej przyjętego przebiegu. | jw. |
| A3-AC05 | W jednym zakresie mogą istnieć jednocześnie jeden przebieg trwający i jeden oczekujący, ale nigdy dwa oczekujące ani dwa trwające. Dotychczasowe uruchamianie synchronizacji działa bez zmian. | jw. i istniejące testy synchronizacji |

<a id="a4"></a>

## Zadanie 0mq.4 — Zapis wyników pobierania

Moduł Źródła ofert zapisuje porcję ogłoszeń przebiegu: ogłoszenia, obserwacje i wersje treści. Zwraca też podsumowanie porcji. Reguły: F2-02, F2-03, F2-12.

Dostępność ma trzy odrębne podstawy ([F1](../../../modules/sources/README.md#jak-ustalana-jest-dostępność)):

1. **Obserwacja ogłoszenia** w wynikach aktywnych ofert przywraca jego dostępność już przy zapisie porcji, także w przebiegu, który skończy się częściowo.
2. **Informacja ze źródła o konkretnym ogłoszeniu**, czyli status zamknięcia i data ważności, nie zależy od pobrania pozostałych wyników. Brak tej informacji pozostaje niewiadomą.
3. **Brak ogłoszenia w wynikach** nie jest sam dowodem niedostępności. Wnioskowanie z braku należy do zadania 0mq.7, a nie do zapisu porcji.

Przykład: A było niedostępne, B dostępne. Pierwsza porcja zawiera A jako aktywne, potem pobieranie się przerywa. A odzyskuje dostępność, B zachowuje stan. Jeśli A ma przeszłą datę ważności, informacja o wygaśnięciu zostaje zachowana.

| Wymaganie | Treść |
| --- | --- |
| A4-R01 | Porcje zapisują się przyrostowo, każda w całości albo wcale. Błąd późniejszego pobierania nie usuwa wcześniej zapisanych ogłoszeń, obserwacji i wersji. |
| A4-R02 | Źródło i identyfikator ogłoszenia w źródle wskazują jedno ogłoszenie, także przy pobraniu w innym zakresie. Identyczna treść nie tworzy nowej wersji, a zmieniona tworzy wersję bez usuwania historii. |
| A4-R03 | Zapis przywraca dostępność obserwowanego ogłoszenia i zachowuje informacje ze źródła o jego ważności i statusie. Nie dopowiada statusu zamknięcia ani terminu, których źródło nie podało. |
| A4-R04 | Zapis porcji nie zmienia dostępności ogłoszeń nieobecnych w porcji. Dotychczasowe oznaczanie niewidzianych ogłoszeń po pełnym przebiegu SOLID.Jobs działa bez zmian do zadania 0mq.7. |
| A4-R05 | Obserwacje, rozpoznawanie powtórnych obserwacji i liczniki przebiegu zachowują znaczenie. Podsumowanie porcji podaje liczbę nowych obserwacji, powtórnych obserwacji i nowych wersji. |
| A4-R06 | Powtórzone ogłoszenie w porcji i między porcjami nie przerywa zapisu (F2-03). |
| A4-R07 | Błąd zapisu porcji jest zgłaszany procesowi synchronizacji, który może przez to zakończyć przebieg błędem. |
| A4-R08 | Zadanie nie łączy dostępności z wygaśnięciem, nie zmienia prezentacji stanów i nie dodaje zasad rozstrzygania sprzecznych informacji ze źródła. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A4-AC01 | Po zapisie dwóch porcji i błędzie w trzeciej ogłoszenia, obserwacje i wersje z dwóch pierwszych zostają zachowane. | Test automatyczny na rzeczywistej bazie |
| A4-AC02 | To samo ogłoszenie zapisane w dwóch przebiegach o różnych zakresach jest jednym ogłoszeniem z obserwacjami w obu przebiegach. Identyczna treść nie tworzy wersji, zmieniona tworzy, a poprzednie wersje zostają. | jw. |
| A4-AC03 | Ogłoszenie wcześniej niedostępne, zaobserwowane w pierwszej porcji przebiegu przerwanego później, jest po przerwaniu dostępne. | jw. |
| A4-AC04 | Ogłoszenie dostępne, nieobecne w częściowym lub nieudanym przebiegu, pozostaje dostępne. | jw. |
| A4-AC05 | Ponownie zaobserwowane ogłoszenie z przeszłą datą ważności jest nadal prezentowane jako wygasłe. Ogłoszenie bez daty ważności nie ma terminu. | jw. |
| A4-AC06 | Powtórna obserwacja ogłoszenia w tym samym przebiegu nie zwiększa liczby unikalnych ogłoszeń przebiegu; podsumowanie liczy ją jako powtórną. Liczniki przebiegu rosną jak dotąd. | jw. |
| A4-AC07 | Ogłoszenie powtórzone w porcji i między porcjami nie przerywa zapisu, a następna porcja zostaje zapisana. | jw. |
| A4-AC08 | Błąd zapisu w trakcie porcji wycofuje całą porcję i zostaje zgłoszony jako błąd zapisu. | jw., z wymuszonym błędem |
| A4-AC09 | Pełny przebieg SOLID.Jobs nadal oznacza niewidziane ogłoszenia zakresu jako niedostępne, a pełny przebieg Himalayas nie zmienia dostępności niewidzianych ogłoszeń. | Istniejące testy synchronizacji |

<a id="a5"></a>

## Zadanie 0mq.5 — Wspólne wykonanie przebiegu synchronizacji

Każdy przebieg, niezależnie od źródła, wykonuje jeden wspólny proces. Odczytuje on zapisane ustawienia przebiegu, uruchamia konektor źródła, zapisuje porcje i kończy przebieg. Reguły: F2-01–F2-04, F2-11–F2-13.

| Wymaganie | Treść |
| --- | --- |
| A5-R01 | Wspólny proces wykonuje przebiegi wszystkich źródeł i nie zawiera warunków zależnych od konkretnego źródła ani interpretacji jego stron, komunikatów i diagnostyki. |
| A5-R02 | Proces korzysta z ustawień zapisanych przy przyjęciu przebiegu, a nie z bieżących ustawień źródła. |
| A5-R03 | Status kończonego przebiegu: kompletny, gdy źródło sprawdziło cały zakres i wszystkie porcje się zapisały; częściowy, gdy przebieg nie jest kompletny, ale zapisał co najmniej jedno ogłoszenie; nieudany w pozostałych przypadkach. Błąd zapisu nigdy nie daje statusu kompletnego. Reguła obowiązuje każde źródło. Niekompletny przebieg bez zapisanego ogłoszenia jest nieudany także tam, gdzie dziś kończy się jako częściowy: w SOLID.Jobs po przeczytaniu choć jednej strony, w JobSpy przy statusie narzędzia innym niż nieudany. Zmiana jest zamierzona (decyzja właściciela z 2026-11-16). |
| A5-R04 | Nieznane źródło i błędne ustawienia przebiegu kończą przebieg nieudanym z zapisanym błędem. Zapisany komunikat nie zawiera sekretów ani surowych odpowiedzi źródła. |
| A5-R05 | Przerwanie pracy procesu jest obsługiwane według F2-13: przebieg zostaje wznowiony albo jawnie zakończony, proces, który go utracił, przestaje zapisywać, a ponowna próba kontynuuje ten sam przebieg bez duplikowania ogłoszeń. |
| A5-R06 | Przebieg pozostawiony bez wykonawcy jest rozpoznawany przy starcie workera i okresowo, a następnie wznawiany albo jawnie kończony. Odzyskiwanie nie wymaga wyłącznego dostępu jednego workera. |
| A5-R07 | Po kompletnym przebiegu proces uruchamia ocenę dostępności z kontekstem źródła, zakresu i rezultatu, w jednej operacji z zapisem zakończenia. Do zadania 0mq.7 ocena działa według dotychczasowej reguły. |
| A5-R08 | Dotychczasowe zlecanie przebiegów (CLI, aplikacja, harmonogram) działa bez zmian i korzysta z nowego wykonania. Himalayas, uruchamiany dziś bez kolejki, korzysta ze wspólnego wykonania w procesie CLI do zadania 0mq.16. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A5-AC01 | Przebieg z symulowanym źródłem zapisuje jedną i wiele porcji, a status wynika z rezultatu źródła zgodnie z A5-R03. | Test automatyczny na rzeczywistej bazie i kolejce |
| A5-AC02 | Proces nie rozróżnia źródeł: ten sam test przechodzi dla dwóch symulowanych źródeł o różnych nazwach. | Test automatyczny i przegląd kodu |
| A5-AC03 | Zmiana ustawień źródła po przyjęciu przebiegu nie zmienia ustawień, z którymi wykonuje się przebieg. | Test automatyczny |
| A5-AC04 | Błąd pobierania po zapisanej porcji daje przebieg częściowy z wcześniejszymi danymi i obserwacjami. Błąd zapisu przy rezultacie kompletnym daje przebieg częściowy albo nieudany, nigdy kompletny. | jw. |
| A5-AC05 | Nieznane źródło i błędne ustawienia dają przebieg nieudany z zapisanym błędem bez sekretów. | jw. |
| A5-AC06 | Utrata procesu w trakcie przebiegu prowadzi do jego wznowienia lub jawnego zakończenia; ogłoszenia nie są zdublowane, a liczba przebiegów się nie zmienia. | Test automatyczny z rzeczywistą kolejką i symulowaną utratą procesu |
| A5-AC07 | Proces, który utracił przebieg, nie zapisuje kolejnych porcji ani zakończenia. | jw. |
| A5-AC08 | Ponowne dostarczenie pracy przebiegu zakończonego nie zmienia jego stanu. | jw. |
| A5-AC09 | Przebieg trwający bez aktywnej pracy w kolejce zostaje rozpoznany i zakończony z komunikatem o przerwaniu. | jw. |
| A5-AC10 | Pełny przebieg SOLID.Jobs oznacza niewidziane ogłoszenia zakresu jako niedostępne w jednej operacji z zakończeniem przebiegu; pełny przebieg Himalayas tego nie robi. | Istniejące testy synchronizacji |
| A5-AC11 | Wszystkie dotychczasowe sposoby zlecania (CLI dla każdego źródła, zlecenie polskiego portalu z aplikacji, harmonogram SOLID.Jobs) kończą się przebiegiem wykonanym przez wspólny proces. | Istniejące i uzupełnione testy synchronizacji |
| A5-AC12 | Wynik zadania rozróżnia testy wykonane od pominiętych. | Przegląd wyniku zadania |

<a id="a19"></a>

## Zadanie 0mq.19 — Przyjęcie bez ponawiania prób

Gdy zlecenie trafia na istniejący oczekujący przebieg tego samego źródła i zakresu, przyjęcie zwraca ten przebieg z informacją, że synchronizacja już jest zlecona, i niczego nie ponawia. Dziś przyjęcie z zadania 0mq.3 ponawia wstawienie do trzech razy, gdy oczekujący przebieg ruszy, zanim zostanie odczytany. Decyzja właściciela z 2026-11-16: ponawianie jest zbędne. Reguła F2-07 się nie zmienia. Reguły: F2-07.

| Wymaganie | Treść |
| --- | --- |
| A19-R01 | Przyjęcie, które nie wstawiło przebiegu z powodu oczekującego przebiegu tego zakresu, nie ponawia wstawienia. Zwraca identyfikator tego przebiegu i informację, że wskazano istniejący, także gdy przebieg w międzyczasie ruszył. |
| A19-R02 | Gdy przebiegu, który zablokował wstawienie, nie ma już wśród aktywnych, przyjęcie kończy się błędem bez zmian, a wywołujący może zlecić ponownie. |
| A19-R03 | Pozostałe zachowanie przyjęcia z zadania 0mq.3 i reguła F2-07 się nie zmieniają. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A19-AC01 | Gdy oczekujący przebieg rusza między nieudanym wstawieniem a odczytem, przyjęcie zwraca identyfikator tego przebiegu z informacją, że wskazano istniejący, i nie tworzy przebiegu ani zlecenia w kolejce. | Test automatyczny na rzeczywistej bazie i kolejce |
| A19-AC02 | Gdy przebieg, który zablokował wstawienie, zakończy się przed odczytem, przyjęcie kończy się błędem i nie zostawia przebiegu, zakresu ani zlecenia. | jw. |
| A19-AC03 | Przyjęcie wykonuje najwyżej jedną próbę wstawienia. | Przegląd kodu i test z A19-AC01 |
| A19-AC04 | Kryteria A3-AC01–AC05 nadal są spełnione. | Istniejące testy przyjęcia |

<a id="a16"></a>

## Zadanie 0mq.16 — Wspólne zlecanie synchronizacji

Wszystkie sposoby uruchomienia zlecają synchronizację jedną operacją i podlegają tym samym regułom kolejki. Reguły: F2-06–F2-10.

| Wymaganie | Treść |
| --- | --- |
| A16-R01 | CLI dla każdego źródła, aplikacja i harmonogram zlecają synchronizację tą samą operacją modułu Źródła ofert. |
| A16-R02 | Kolejka stosuje F2-06 i F2-07 dla wszystkich źródeł, także przy wielu workerach. |
| A16-R03 | Harmonogram tworzy jedno zlecenie na wystąpienie (dzień i godzina harmonogramu). Ponowne sprawdzenie tego samego wystąpienia nie tworzy zlecenia. Zlecenie ręczne wcześniej tego dnia nie wstrzymuje zlecenia z harmonogramu. Nie ma blokady ponownego pobrania tego samego dnia ani wygasania oczekujących przebiegów. |
| A16-R04 | Aplikacja i harmonogram dostają identyfikator przebiegu bez czekania. CLI czeka na wynik swojego przebiegu bez limitu czasu, także gdy zlecenie wskazało istniejący oczekujący przebieg, i kończy się kodem błędu, gdy przebieg nie jest kompletny. Przerwanie oczekiwania nie anuluje przebiegu. |
| A16-R05 | Himalayas jest zlecany i wykonywany jak pozostałe źródła. |
| A16-R06 | Stan przebiegu i stan katalogu źródeł są odczytywane jedną operacją modułu dla wszystkich źródeł. Odpowiedzi aplikacji i komunikaty CLI zachowują dotychczasową treść. |
| A16-R07 | Przebiegi czekające w dotychczasowych kolejkach w chwili wdrożenia są kończone przez odzyskiwanie z komunikatem o przerwaniu; właściciel zleca je ponownie. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A16-AC01 | Równoczesne zlecenia tego samego źródła i zakresu tworzą najwyżej jeden przebieg oczekujący i zwracają jego identyfikator; nie powstają przebiegi ani zlecenia osierocone. | Test automatyczny na rzeczywistej bazie i kolejce |
| A16-AC02 | Przy trwającym przebiegu powstaje jeden oczekujący, a kolejne zlecenia go wskazują. Nic nie przerywa trwającego przebiegu. | jw. |
| A16-AC03 | Dwa workery nie wykonują równolegle przebiegów jednego źródła, także w różnych zakresach; przebiegi różnych źródeł wykonują się równolegle; przebiegi jednego źródła wykonują się w kolejności zlecenia. | Test automatyczny z dwoma workerami na rzeczywistej kolejce |
| A16-AC04 | Wielokrotne sprawdzenie tego samego wystąpienia harmonogramu tworzy jedno zlecenie. Zlecenie ręczne tego samego dnia nie wstrzymuje harmonogramu, a drugie zlecenie ręczne tego dnia jest przyjmowane według F2-07. | Test automatyczny |
| A16-AC05 | Aplikacja i harmonogram wracają po zleceniu z identyfikatorem przebiegu. CLI czeka na zakończenie swojego przebiegu dłużej niż dotychczasowe 120 s i zwraca kod zależny od statusu. | Test automatyczny i uruchomienie CLI z symulowanym źródłem |
| A16-AC06 | Zmiana ustawień po zleceniu nie zmienia ustawień przebiegu; zlecenia z CLI i z aplikacji z równoważnymi parametrami trafiają do tego samego zakresu. | Test automatyczny |
| A16-AC07 | Himalayas jest zlecany przez CLI do kolejki i wykonywany przez worker. | Test automatyczny |
| A16-AC08 | Odpowiedzi aplikacji o stanie źródeł i przebiegów mają dotychczasową postać. | Istniejące testy tras aplikacji |
| A16-AC09 | Przebieg oczekujący w dotychczasowej kolejce zostaje po wdrożeniu zakończony z komunikatem o przerwaniu. | Test automatyczny odzyskiwania |

<a id="a7"></a>

## Zadanie 0mq.7 — Niedostępność ogłoszeń po pełnym przebiegu

Wspólna reguła modułu Źródła ofert ustala, które ogłoszenia stały się niedostępne, na podstawie historii obserwacji w zakresie. Zastępuje regułę wbudowaną dziś w synchronizację SOLID.Jobs. Reguły: F2-12.

| Wymaganie | Treść |
| --- | --- |
| A7-R01 | Po kompletnym przebiegu źródła, które dopuszcza wnioskowanie z braku, ogłoszenia tego źródła widziane wcześniej w tym samym zakresie, a nieobecne w bieżącym przebiegu, stają się niedostępne. |
| A7-R02 | O tym, czy ogłoszenie należało do zakresu, decyduje historia obserwacji w przebiegach zakresu, a nie ostatni zakres, w którym ogłoszenie widziano. |
| A7-R03 | Przebiegi częściowe i nieudane nie zmieniają dostępności niewidzianych ogłoszeń. Kompletny przebieg źródła, które nie dopuszcza wnioskowania z braku (np. Himalayas), też nie. |
| A7-R04 | Oznaczenie niedostępności i zapis zakończenia przebiegu jako kompletnego wykonują się razem albo wcale. |
| A7-R05 | Reguła nie zależy od nazwy źródła; dopuszczenie wnioskowania pochodzi z deklaracji konektora. Nie sprawdza, czy zniknięcie wynika ze zmiany treści powodującej niespełnienie filtrów. |
| A7-R06 | Późniejsza obserwacja w dowolnym zakresie przywraca dostępność; przejściowe zniknięcie i ponowne pojawienie się ogłoszenia jest akceptowane. Informacje o wygaśnięciu ze źródła pozostają odrębne. |

Przykład: ogłoszenie X widziano w przebiegu zakresu PHP, a później w przebiegu zakresu Java. Kolejny pełny przebieg PHP bez X oznacza X jako niedostępne, choć ostatnim zakresem X jest Java. Następny przebieg Java, który znajdzie X, przywraca jego dostępność.

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A7-AC01 | Po pełnym przebiegu SOLID.Jobs ogłoszenia widziane wcześniej w zakresie i nieobecne w przebiegu są niedostępne. | Test automatyczny na rzeczywistej bazie |
| A7-AC02 | Przebieg częściowy i nieudany nie zmieniają dostępności niewidzianych ogłoszeń; pełny przebieg Himalayas też nie. | jw. |
| A7-AC03 | Błąd w trakcie oznaczania wycofuje oznaczenie i przebieg nie jest kompletny. | jw., z wymuszonym błędem |
| A7-AC04 | Przykład X: oznaczenie po pełnym przebiegu PHP i przywrócenie po przebiegu Java. | jw. |
| A7-AC05 | Ogłoszenie nigdy niewidziane w zakresie A nie zmienia dostępności po pełnym przebiegu A. | jw. |
| A7-AC06 | Reguła nie zawiera warunków zależnych od nazwy źródła. | Przegląd kodu |

<a id="a8"></a>

## Zadanie 0mq.8 — Moduł Oferty

Kod przeglądania ofert tworzy moduł Oferty z publicznymi operacjami. Widoki zostają na miejscu i korzystają z API.

| Wymaganie | Treść |
| --- | --- |
| A8-R01 | Logika listy i szczegółów ofert, filtrowania, sortowania, paginacji i prezentacji wynagrodzeń należy do modułu Oferty, razem z dedykowanymi jej testami. |
| A8-R02 | Trasy API ofert przekazują żądania do publicznych operacji modułu. |
| A8-R03 | Lista i szczegóły działają jak dotąd: te same filtry, sortowanie, paginacja, prezentacja wynagrodzeń i dane w odpowiedziach. |
| A8-R04 | Do zadań 0mq.6 i 0mq.18 moduł Oferty korzysta z dotychczasowych odczytów danych Źródeł i Dopasowania; przeniesienie ich nie zmienia. |
| A8-R05 | Opis modułu przypisuje mu odpowiedzialność za grupowanie ogłoszeń tej samej rekrutacji w ofertę pracy i odróżnia ją od stanu wdrożenia: grupowanie nie jest wdrożone i nie należy do epiku. Opis podaje też publiczne operacje, strukturę i zależności modułu. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A8-AC01 | Kod listy i szczegółów ofert oraz jego dedykowane testy należą do modułu Oferty; poza modułem zostają tylko trasy, które do niego delegują, i widoki. | Przegląd kodu |
| A8-AC02 | Lista i szczegóły zwracają te same dane dla tych samych filtrów, sortowania i strony co przed zmianą. | Istniejące testy ofert |
| A8-AC03 | Opis modułu spełnia A8-R05. | Przegląd dokumentacji |

<a id="a6"></a>

## Zadanie 0mq.6 — Odczyt ogłoszeń przez kontrakt Źródeł

Źródła ofert udostępniają publiczny odczyt ogłoszeń źródłowych i ich wersji. Oferty, Dopasowanie i Firmy przestają czytać dane Źródeł bezpośrednio i interpretować treść ogłoszeń.

| Wymaganie | Treść |
| --- | --- |
| A6-R01 | Źródła udostępniają odczyt aktualnego ogłoszenia z identyfikatorem jego bieżącej wersji, odczyt wielu ogłoszeń naraz, odczyt wskazanej wersji i listę wersji ogłoszenia. |
| A6-R02 | Odczyt zwraca ogłoszenie w ujednoliconej postaci: tytuł, firmę, adres, opis, umiejętności, wynagrodzenia z pochodzeniem kwoty, lokalizacje, poziom, wymiar, tryb pracy, daty, dostępność, wygaśnięcie, źródło i kwalifikację pracy zdalnej. Znaczenie pól określają Źródła; tłumaczenie treści ze źródła należy do nich. |
| A6-R03 | Oferty składają listę i szczegóły z odczytu Źródeł. Dopasowanie pobiera ogłoszenie do oceny, bieżące wersje do ustalenia aktualności ocen i ogłoszenia do listy przez odczyt Źródeł. Firmy pobierają ogłoszenia powiązane z firmą, tytuły wersji w historii powiązań, nazwę firmy z ogłoszenia i bieżącą wersję przy powiązaniu przez odczyt Źródeł. |
| A6-R04 | Ocena dopasowania korzysta z treści i identyfikatora tej samej wersji ogłoszenia. |
| A6-R05 | Odczyt nie blokuje zmian ogłoszenia. Powiązanie firmy z ogłoszeniem zapisuje wersję odczytaną w chwili powiązania; jeśli ogłoszenie zmieni się w tym czasie, powiązanie wskazuje poprzednią wersję. Zmiana jest akceptowana na tych samych zasadach co przy ocenie dopasowania. |
| A6-R06 | Widoki listy i szczegółów, oceny i firmy pokazują te same dane co przed zmianą. Odczyty dla list pobierają dane zbiorczo, bez osobnego odczytu dla każdej pozycji. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A6-AC01 | Odczyt aktualnego ogłoszenia, wielu ogłoszeń, wskazanej wersji i listy wersji zwraca dane z A6-R01 i A6-R02. | Test automatyczny na rzeczywistej bazie |
| A6-AC02 | Dla tych samych danych lista i szczegóły ofert, wejście oceny dopasowania i widoki firm zawierają te same wartości co przed zmianą. | Istniejące testy ofert, dopasowania i firm |
| A6-AC03 | Ocena zapisana dla ogłoszenia wskazuje wersję, której treść oceniono, także gdy ogłoszenie zmieni się w trakcie oceny. | Test automatyczny |
| A6-AC04 | Oferty, Dopasowanie i Firmy nie czytają danych Źródeł inaczej niż przez ich publiczny odczyt i nie interpretują samodzielnie treści ogłoszeń. | Przegląd kodu |
| A6-AC05 | Lista ofert z ocenami wykonuje stałą liczbę odczytów niezależnie od liczby ofert. | Test automatyczny licznika zapytań albo przegląd kodu |

<a id="a10"></a>

## Zadanie 0mq.10 — Publiczny odczyt Profilu zawodowego

Dopasowanie korzysta z zatwierdzonych wersji profilu przez publiczny odczyt Profilu ([kontrakt Profilu](../../../modules/profile/README.md#publiczne-operacje)). Profil ukrywa sposób przechowywania wersji, a Dopasowanie nadal odpowiada za regułę aktualności oceny.

| Wymaganie | Treść |
| --- | --- |
| A10-R01 | Profil udostępnia aktywną zatwierdzoną wersję z jej identyfikatorem albo jawną informację, że aktywnej wersji nie ma, oraz odczyt wskazanych wersji. |
| A10-R02 | Dopasowanie korzysta z tego odczytu przy zlecaniu ocen pojedynczych i grupowych, ocenie ręcznej, odczycie historii, sprawdzaniu gotowości profilu i ustalaniu aktualności ocen. Nie czyta danych Profilu inaczej. |
| A10-R03 | Nowe oceny w jednej grupie używają tej samej wersji profilu. Zlecenia zapisują identyfikator wersji i przygotowane wejście jak dotąd. Brak zatwierdzonego profilu daje dotychczasowy komunikat. |
| A10-R04 | Odczyt profilu nie blokuje zatwierdzenia nowej wersji (decyzja w [0mq.13](#a13)). |
| A10-R05 | Widoki listy i historii ocen pobierają dane wersji zbiorczo. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A10-AC01 | Odczyt zwraca aktywną wersję z identyfikatorem, informację o braku aktywnej wersji i wskazane wersje. | Test automatyczny na rzeczywistej bazie |
| A10-AC02 | Zlecenia ocen, ocena ręczna, historia, gotowość profilu i aktualność ocen działają jak dotąd; brak profilu daje dotychczasowy komunikat. | Istniejące testy dopasowania |
| A10-AC03 | Grupa ocen zlecona podczas zatwierdzania nowej wersji używa w całości jednej wersji. | Test automatyczny |
| A10-AC04 | Zatwierdzenie nowej wersji nie czeka na trwającą publikację oceny. | Test automatyczny z równoległymi operacjami |
| A10-AC05 | Dopasowanie nie czyta danych Profilu inaczej niż przez jego publiczny odczyt, a lista i historia ocen wykonują stałą liczbę odczytów profilu. | Przegląd kodu |

<a id="a14"></a>

## Zadanie 0mq.14 — Kontrakt AI, koordynacja wykonania i adaptery dostawców

Moduł AI udostępnia ogólne możliwości pracy z modelem, niezależne od przypadków biznesowych: pojedyncze wykonanie, przetwarzanie wsadowe i pracę agentową ([opis modułu AI](../../../modules/ai/README.md)). Zadanie ustala granice i kierunek zależności; obsługa cyklu życia i rozliczeń może być uproszczona zgodnie z [F4](#f4). Przejmuje etap 1 epiku `oferty-pracy-334` (wspólna konfiguracja i budżet, kryteria E01-AC01–04 w [dokumentach etapu](../lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md)).

| Wymaganie | Treść |
| --- | --- |
| A14-R01 | Publiczne operacje AI wyrażają ogólne możliwości wykonania i nie znają przypadku biznesowego klienta: zlecenie wykonania z instrukcją, schematem odpowiedzi i wejściem; odczyt stanu, wyniku, użycia i kosztu; odczyt budżetu. |
| A14-R02 | Wspólny przebieg obsługi wykonania i jego rozliczenia należy do modułu AI: wybór dostawcy i modelu z konfiguracji, utrwalenie ustawień przy zleceniu, kolejka, rezerwacja budżetu, ponowienia, odzyskiwanie, współdzielenie lokalnego modelu i rozliczenie. |
| A14-R03 | Szczegóły dostawcy (protokół, stan zadania u dostawcy, kolejne kroki integracji, dane o użyciu) należą do jego adaptera. Adapter realizuje rozliczenie w przebiegu wyznaczonym przez moduł AI i nie ustala własnej polityki modułu. |
| A14-R04 | Moduł zlecający przygotowuje zlecenie, interpretuje wynik i decyduje o jego zastosowaniu. AI nie zapisuje danych biznesowych klienta. |
| A14-R05 | Wynik wykonania trafia do modułu zlecającego przez kontrakt zdefiniowany przez AI, a rozliczenie może nastąpić w tej samej operacji co publikacja wyniku przez klienta. |
| A14-R06 | Konfiguracja, ceny i arytmetyka kosztów mają jednego właściciela w module AI i działają jak dotąd (E01-AC01–02). Sprawdzenie budżetu, zapis próby i zlecenie pracy pozostają w jednej operacji (E01-AC03). |
| A14-R07 | Uproszczenia są jawnie opisane w opisie modułu AI i oddzielone od wymagań epiku `oferty-pracy-sq2`. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A14-AC01 | Publiczne operacje AI nie zawierają pojęć Profilu, Dopasowania ani Firm. | Przegląd kodu |
| A14-AC02 | Zlecenie wykonania z symulowanym dostawcą przechodzi przez kolejkę i kończy się stanem, wynikiem, użyciem i kosztem dostępnymi przez odczyt; wynik trafia do zarejestrowanego odbiorcy klienta. | Test automatyczny na rzeczywistej bazie i kolejce |
| A14-AC03 | Wycofanie operacji klienta wycofuje zlecenie wykonania i rezerwację budżetu. | jw. |
| A14-AC04 | Odrzucenie wyniku przez klienta nadal rozlicza poniesiony koszt; nieznany koszt pozostaje zarezerwowany. | jw. |
| A14-AC05 | Kryteria E01-AC01–04 są spełnione. | Testy wskazane w SD etapu 1 i istniejące testy konfiguracji i budżetu |
| A14-AC06 | Opis modułu AI wymienia uproszczenia i odsyła usprawnienia do `oferty-pracy-sq2`. | Przegląd dokumentacji |
| A14-AC07 | Protokoły i stany dostawców występują tylko w adapterach; koordynacja AI i moduły zlecające ich nie znają, a AI nie zapisuje danych biznesowych klientów. | Przegląd kodu |

<a id="a9"></a>

## Zadanie 0mq.9 — Propozycja profilu przez moduł AI

Profil zleca przygotowanie propozycji z CV przez kontrakt AI i nie obsługuje dostawców. Przejmuje etap 2 epiku `oferty-pracy-334` (kryteria E02-AC01–04 w [dokumentach etapu](../lokalne-ai/etapy/02-profil-adapter/requirements.md)).

| Wymaganie | Treść |
| --- | --- |
| A9-R01 | Profil zleca przygotowanie propozycji z oczyszczonego tekstu CV i dostaje identyfikator wykonania. Przez ten sam kontrakt odczytuje ujednolicony stan i wynik. Zmiana dostawcy lub modelu nie wymaga zmiany Profilu. |
| A9-R02 | Wybór dostawcy, kolejka, wspólne wykonanie lokalne, ponowienia, odzyskiwanie, budżet i rozliczenie są po stronie AI i działają jak dotąd, łącznie z historią prób i obsługą niepewnego wykonania i kosztu ([F4](#f4)). |
| A9-R03 | Warstwa integrująca przekłada zlecenie propozycji na instrukcję i schemat odpowiedzi i przekazuje Profilowi wynik w ustalonym formacie. |
| A9-R04 | Profil wiąże wynik z rewizją tekstu, sprawdza cytaty i zapisuje propozycję we własnych danych. Wynik dla starszej rewizji nie zastępuje nowszej propozycji. Właściciel nadal wybiera zmiany do szkicu i osobno zatwierdza wersję. |
| A9-R05 | Profil nie czyta ani nie zapisuje danych modułu AI inaczej niż przez jego kontrakt. Najwyżej jedno przygotowanie propozycji dla importu jest w toku, jak dotąd. |
| A9-R06 | Opis modułu AI wyjaśnia, jak dodać nową ścieżkę wykonania (np. lokalny model dla kolejnego zadania) przez kontrakt AI, na potrzeby zadania `oferty-pracy-334.6`. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A9-AC01 | Przygotowanie propozycji działa ścieżką płatną i lokalną z symulowanymi dostawcami: poprawny wynik daje propozycję dla właściwej rewizji. | Test automatyczny na rzeczywistej bazie |
| A9-AC02 | Wynik z niepotwierdzonym cytatem jest odrzucony, a wynik dla starszej rewizji nie zastępuje propozycji nowszej. | jw. |
| A9-AC03 | Przerwana próba jest odzyskiwana w zakresie, w jakim działa to dziś. | jw. |
| A9-AC04 | Import, zastosowanie propozycji i odczyt zapisanych propozycji działają jak dotąd. | Istniejące testy profilu |
| A9-AC05 | Kryteria E02-AC01–04 są spełnione. | Testy wskazane w SD etapu 2 |
| A9-AC06 | Profil nie korzysta z danych i wnętrza modułu AI poza jego kontraktem. | Przegląd kodu |
| A9-AC07 | Opis modułu AI spełnia A9-R06. | Przegląd dokumentacji |

<a id="a11"></a>

## Zadanie 0mq.11 — Operacje Profilu dla tras aplikacji

Trasy Profilu przekazują żądania do publicznych operacji Profilu i nie łączą danych kilku modułów.

| Wymaganie | Treść |
| --- | --- |
| A11-R01 | Lista i szczegóły importów oraz odczyt wersji profilu pochodzą z operacji Profilu. |
| A11-R02 | Zastosowanie propozycji prowadzi w całości Profil: odczyt propozycji, sprawdzenie rewizji, walidację wyniku i zapis szkicu, zgodnie z [zasadami architektury](../../architecture/moduly-i-zasady-kodu.md#operacja-modułu-prowadzi-cały-przypadek-użycia). |
| A11-R03 | Podsumowanie budżetu AI w odpowiedzi profilu pochodzi z operacji modułu AI. |
| A11-R04 | Odpowiedzi tras i obsługa konfliktów rewizji pozostają bez zmian. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A11-AC01 | Trasy profilu zwracają te same odpowiedzi co przed zmianą, także przy konflikcie rewizji szkicu i tekstu. | Istniejące testy tras profilu |
| A11-AC02 | Trasy profilu nie czytają danych Profilu ani AI inaczej niż przez operacje tych modułów i nie zawierają logiki zastosowania propozycji. | Przegląd kodu |

<a id="a17"></a>

## Zadanie 0mq.17 — Próby i rozliczenia AI Dopasowania i Firm

Dopasowanie i Firmy zlecają pracę AI i rozliczają ją przez kontrakt AI. Przejmuje etapy 3 i 4 epiku `oferty-pracy-334` (kryteria E03-AC01–05 i E04-AC01–04 w dokumentach [etapu 3](../lokalne-ai/etapy/03-oceny-batch/requirements.md) i [etapu 4](../lokalne-ai/etapy/04-research-wykonawca/requirements.md)).

| Wymaganie | Treść |
| --- | --- |
| A17-R01 | Oceny pojedyncze i grupowe korzystają z kontraktu AI; przetwarzanie wsadowe u dostawcy należy do AI. Dopasowanie przygotowuje zlecenie i interpretuje wynik. |
| A17-R02 | Research firmy korzysta z kontraktu AI w trybie pracy agentowej; wyszukiwanie i synteza u dostawcy należą do AI. Firmy przygotowują zlecenie i walidują raport. |
| A17-R03 | Dopasowanie i Firmy nie czytają ani nie zapisują danych modułu AI inaczej niż przez jego kontrakt. |
| A17-R04 | Zachowane są w obecnym zakresie: łączne rozliczenie i publikacja, rozliczenie przy odrzuconej treści, niepewny koszt, rezerwacja grupy w całości oraz obsługa wyników wsadowych i researchu po błędzie ([F4](#f4)). |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A17-AC01 | Oceny pojedyncze, grupowe, ręczne i research działają jak dotąd z symulowanymi dostawcami. | Istniejące testy dopasowania i firm |
| A17-AC02 | Kryteria E03-AC01–05 są spełnione. | Testy wskazane w SD etapu 3 |
| A17-AC03 | Kryteria E04-AC01–04 są spełnione. | Testy wskazane w SD etapu 4 |
| A17-AC04 | Dopasowanie i Firmy nie korzystają z danych i wnętrza modułu AI poza jego kontraktem. | Przegląd kodu |

<a id="a18"></a>

## Zadanie 0mq.18 — Neutralni właściciele wspólnych mechanizmów

Mechanizmy używane przez wiele modułów mają neutralnych właścicieli, a moduły nie zależą od wnętrza Profilu.

| Wymaganie | Treść |
| --- | --- |
| A18-R01 | Dotychczasowe pomocnicze mechanizmy transakcji modułów zostają zastąpione wspólnym mechanizmem z zadania 0mq.13, z zachowaniem granic transakcji. |
| A18-R02 | Walidacja identyfikatorów, wspólna obsługa żądań HTTP i dostęp do kolejki w trasach mają neutralnego właściciela; trasy Dopasowania, Firm i Źródeł nie korzystają z nich przez Profil. |
| A18-R03 | Usuwanie danych kontaktowych z tekstu jest wspólnym mechanizmem niezależnym od importu CV. |
| A18-R04 | Dopasowanie i Firmy dostają dane zatwierdzonego profilu przez jego kontrakt i nie korzystają z wewnętrznych schematów Profilu. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A18-AC01 | Nie ma pomocniczych mechanizmów transakcji poza wspólnym; operacje zapisują się z tymi samymi granicami co przed zmianą. | Przegląd kodu i istniejące testy |
| A18-AC02 | Dopasowanie, Firmy, Źródła i ich trasy nie korzystają z wnętrza Profilu. | Przegląd kodu |
| A18-AC03 | Import CV, zastosowanie propozycji, zlecenia ocen, ocena ręczna, lista i historia ocen, powiązania firm z ogłoszeniami i rozliczenie AI działają jak dotąd. | Istniejące testy |

<a id="a12"></a>

## Zadanie 0mq.12 — Docelowe katalogi modułów

Kod pozostały po wcześniejszych zadaniach trafia do modułów Źródła ofert, Oferty, Profil zawodowy, Dopasowanie, Firmy i AI. Zadanie nie przenosi ponownie kodu ułożonego przez wcześniejsze zadania.

| Wymaganie | Treść |
| --- | --- |
| A12-R01 | Kod każdego modułu leży w jego katalogu, z publicznym wejściem i opisem modułu. |
| A12-R02 | Operacje, reguły, dostęp do danych, integracje oraz obsługa tras, kolejek i poleceń CLI są rozmieszczone według [katalogu modułu](../../architecture/moduly-i-zasady-kodu.md#katalog-modułu). |
| A12-R03 | Pliki wymagane przez framework i uruchomienie zostają na miejscu i delegują do modułów. Widoki zostają na miejscu i korzystają z publicznych wejść modułów. |
| A12-R04 | Wynik zadania wymienia pliki pozostawione poza modułami wraz z powodem. |

| Kryterium | Warunek akceptacji | Sprawdzenie |
| --- | --- | --- |
| A12-AC01 | Każdy z sześciu modułów ma katalog z publicznym wejściem i opisem, a kod spoza modułu importuje go tylko przez publiczne wejście. | Przegląd kodu |
| A12-AC02 | Poza modułami zostają tylko pliki wymagane przez framework i uruchomienie oraz wspólna infrastruktura; wynik zadania wymienia je z powodem. | Przegląd wyniku zadania |
| A12-AC03 | Aplikacja działa jak dotąd. | Kryterium W-AC01 |
