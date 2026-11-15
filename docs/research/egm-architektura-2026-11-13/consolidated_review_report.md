# Ocena przygotowania epiku „Poprawki architektury kodu”

Przegląd epiku `oferty-pracy-0mq` wskazuje, że przyjęty podział na moduły jest uzasadniony, ale część zadań pozostawia wykonawcy decyzje wpływające na zachowanie aplikacji. Najważniejsze luki dotyczą współpracy przy pobieraniu ogłoszeń, wspólnych transakcji oraz przekazywania i rozliczania wyników AI. Ich rozstrzygnięcie pozwoli ograniczyć ryzyko, że porządkowanie kodu niepostrzeżenie zmieni działanie systemu.

Raport służy właścicielowi projektu do oceny tych uwag i podjęcia decyzji, co należy doprecyzować w zadaniach. Przy każdym punkcie wyjaśnia podstawę oceny, możliwe konsekwencje i proponowany kierunek rozwiązania. Propozycje nie stanowią zatwierdzonych wymagań.

## Zakres i sposób odczytywania oceny

Podstawą jest przegląd z 13 listopada 2026 r.: wszystkich 12 otwartych zadań epiku, dokumentacji w `docs/architecture/`, odpowiednich opisów modułów oraz wybranych przepływów w kodzie. Sprawdzano zgodność z przyjętymi regułami: moduł odpowiada za własne dane, inne części systemu korzystają z jego publicznych operacji, a zmiany należące do jednego przypadku użycia mogą uczestniczyć we wspólnej transakcji.

Ocena odnosi się do kodu przy commicie `a6f54a6855c786b8a375401ccf6511b3c0cc624a`. Był to przegląd statyczny: nie uruchamiano aplikacji, testów, kompilacji ani modeli AI. Opisane skutki są ryzykami refaktoryzacji, chyba że wprost wskazano istniejące zachowanie. Raport nie dowodzi występowania tych błędów w działającej aplikacji.

W tej redakcji uwzględniono doprecyzowanie F1 oraz treść zadania o zapisie wyników sprawdzoną 14 listopada. Pozostałe punkty zachowują ocenę z pierwotnego przeglądu; nie przeprowadzono ponownego audytu ich aktualności.

Oznaczenia `.1`–`.12` są skrótami identyfikatorów `oferty-pracy-0mq.1`–`oferty-pracy-0mq.12`. Punkty F1–F7 uznano za istotne, ponieważ niewyjaśnione mogą prowadzić do zmiany zachowania albo niezgodnych implementacji. F8 jest uwagą porządkującą zakres. Sam brak doprecyzowania nie przesądza, że cel zadania jest niewłaściwy.

## F1. Kompletność pobrania warunkuje wnioskowanie z braku ogłoszenia

**Dotyczy:** `.4` — zapis wyników pobierania, oraz `.7` — reguła dostępności po pełnym przebiegu.

### Kontekst i ustalenie

Synchronizacja pobiera ogłoszenia z ustalonego zakresu jednego źródła. Wyniki mogą przychodzić w porcjach, a późniejszy błąd nie unieważnia poprawnych danych odebranych wcześniej. Trzeba więc odróżnić informację o konkretnym znalezionym ogłoszeniu od wniosku wyciąganego z jego nieobecności.

Pierwotny opis zadania `.4` uzależniał aktualizację dostępności od potwierdzenia kompletności. Tak szerokie sformułowanie mogło objąć również przywracanie dostępności ogłoszenia, które właśnie znaleziono. Tymczasem istniejący zapis robi to już podczas odbierania wyników, także gdy cały przebieg ostatecznie pozostaje częściowy.

Istotne są trzy podstawy informacji:

| Podstawa | Co pozwala ustalić | Czy wymaga pełnego przebiegu? |
| --- | --- | --- |
| Ogłoszenie znalezione w wynikach aktywnych ofert | Można potwierdzić jego dostępność podczas pobierania. | Nie. |
| Status lub data ważności przekazane przez źródło | Można zachować informację o zamknięciu lub wygaśnięciu konkretnego ogłoszenia. | Nie. |
| Brak znanego ogłoszenia w wynikach | Można rozważyć oznaczenie go jako niedostępnego. | Tak, ale kompletność sama nie wystarcza: źródło musi pozwalać na takie wnioskowanie, a porównanie dotyczyć tego samego źródła i zakresu. |

Samo otrzymanie treści nie dowodzi aktywności: źródło może nadal zwracać wygasłą publikację. Obecna aplikacja przechowuje dostępność i wylicza wygaśnięcie z daty jako odrębne informacje. Refaktor nie powinien niejawnie ich scalać ani kasować informacji o wygaśnięciu po ponownym pobraniu.

### Dlaczego to ma znaczenie

Przykładowo ogłoszenie A było niedostępne, a B dostępne. W kolejnym pobraniu odnaleziono aktywne A, po czym połączenie zostało przerwane. Jest podstawa do przywrócenia dostępności A. Nie ma podstawy do zmiany B: mogło znajdować się w niepobranej części wyników.

Uzależnienie obu zmian od pełnego przebiegu opóźniałoby wykorzystanie pewnej informacji o A. Z kolei uznawanie każdego braku za niedostępność mogłoby błędnie oznaczać B jako niedostępne. To dwie różne reguły, mimo że obie dotyczą dostępności.

### Stan rozstrzygnięcia

To rozgraniczenie zostało już zapisane w opisie, wskazówkach implementacyjnych i kryteriach odbioru `.4`. Osobna ocena braku ogłoszeń należy do `.7`; osobna odpowiedzialność nie oznacza konieczności uruchamiania nowej kolejki czy procesu w tle. Ogólne zasady wyjaśnia również [opis dostępności w module Źródła](../../../modules/sources/README.md#jak-ustalana-jest-dostępność).

F1 jest zatem doprecyzowany na poziomie wymagań `.4`, ale nie stanowi potwierdzenia wykonania refaktoru. Nie ustalono nowych reguł pierwszeństwa sprzecznych sygnałów ani nie potwierdzono obsługi jawnego statusu zamknięcia we wszystkich konektorach. Takie zmiany wymagałyby osobnej oceny. Zadanie nadal zależy od uzgodnień opisanych w F2 i F3.

## F2. Wspólny sposób pobierania wymaga ustalenia, które różnice mają pozostać

**Dotyczy:** `.1`–`.5`, częściowo `.7`.

### Kontekst i ustalenie

Konektor łączy się ze źródłem i tłumaczy jego dane na postać używaną w aplikacji. Wspólny interfejs ma pozwolić prowadzić pobieranie przez tę samą logikę aplikacji, niezależnie od wybranego konektora. Samo ustalenie, że konektor zwraca porcje ogłoszeń i informację o kompletności, nie określa jednak całej współpracy.

W sprawdzonym kodzie zapis porcji rozpoznaje powtórne obserwacje i aktualizuje liczniki. Wyniki tego zapisu są następnie wykorzystywane przy ocenie kompletności. Potrzebna jest zatem umowa obejmująca zarówno pobieranie, jak i zapis: kto liczy unikalne ogłoszenia, co oznacza duplikat i kto podejmuje końcową decyzję o wyniku przebiegu.

Ponadto istniejące ścieżki różnią się zachowaniem:

| Obszar | Różnica stwierdzona w przeglądzie | Dlaczego wymaga decyzji |
| --- | --- | --- |
| Powtórne zlecenie | Część ścieżek rozpoznaje już zleconą pracę według źródła i zakresu, inne według samego źródła. | Ujednolicenie może dopuścić równoległe pobrania albo zablokować zlecenia, które wcześniej były dozwolone. |
| Harmonogram i czas oczekiwania | Różnią się zabezpieczenia przed ponownym uruchomieniem tego samego dnia oraz czasy wygaśnięcia pracy. | Wspólny wykonawca może zmienić częstotliwość lub możliwość wykonania pobrania. |
| Błąd po odebraniu części danych | Do odróżnienia wyniku częściowego od nieudanego używana jest liczba stron albo obserwacji. | Ten sam przebieg może po refaktorze otrzymać inny status. |
| Uruchomienie z terminala | Istnieje ścieżka bez kolejki, zwracająca wynik bezpośrednio do polecenia. | Wymuszenie kolejki zmieni sposób korzystania z tego polecenia. |
| Zmiana konfiguracji po zleceniu | Jedna ścieżka sprawdza, czy konfiguracja nadal odpowiada zapisanej wersji; inna wykonuje zapisane zapytanie. | Trzeba określić, czy czekająca praca ma zostać wykonana, czy odrzucona po zmianie ustawień. |

### Możliwy skutek i propozycja do oceny

Bez tych rozstrzygnięć dwóch wykonawców może przygotować zgodne typy danych, ale nadać im różne znaczenie. Przykładowo licznik może oznaczać liczbę wszystkich odebranych wpisów albo liczbę unikalnych ogłoszeń. Przy powtórzonym wpisie wyniki będą inne, co może wpłynąć na ocenę kompletności i późniejsze ustalanie niedostępności.

Propozycją jest jeden uzgodniony opis współpracy: znaczenie porcji, zakończenia i błędu, wynik zapisu, liczniki oraz odpowiedzialność za duplikaty. Dla różnic z tabeli warto wskazać, które zachowujemy, a które świadomie zmieniamy. Wybór konektora wymaga również określenia relacji między źródłem a nazwą konektora oraz reakcji na nazwę nieznaną lub zarejestrowaną dwukrotnie.

Osobną granicą do zachowania jest rozpoznawanie zmian treści. Sama zmiana organizacji kodu lub sposobu przedstawienia tych samych danych nie powinna powodować utworzenia nowych wersji wszystkich ogłoszeń. Ocena tej propozycji sprowadza się więc do pytania: czy epik ma jedynie uporządkować istniejące pobieranie, czy również świadomie ujednolicić wybrane zachowania?

## F3. Podział na moduły musi zachować wspólny zapis i ochronę przed równoległą zmianą

**Dotyczy:** `.3`–`.7`, `.10`, `.11`.

### Kontekst i ustalenie

Reguły architektury dopuszczają wspólną transakcję: kilka modułów wykonuje własne operacje, ale wszystkie zmiany zatwierdzają się albo wycofują razem. Zadania odwołują się do tej zasady, lecz nie określają wspólnego sposobu jej stosowania przez nowe publiczne operacje.

Nie chodzi wyłącznie o zatwierdzenie zapisu. W istniejących przepływach blokady bazy chronią stan podczas wykonywania operacji. Przykładowo publikacja oceny dopasowania chroni jednocześnie ogłoszenie i aktywny profil. Po rozdzieleniu odczytów między moduły trzeba zachować tę ochronę. Dwa niezależne odczyty nie są jej równoważnikiem.

### Dlaczego to ma znaczenie

Wyobraźmy sobie, że aplikacja sprawdza aktualną wersję profilu, po czym inna operacja zmienia profil przed zapisaniem oceny. Jeśli refaktor usunie dotychczasową ochronę, wynik oparty na wcześniejszych danych może zostać opublikowany jako aktualny.

Podobny problem dotyczy finalizacji pobrania: oznaczenie niewidzianych ogłoszeń jako niedostępnych i zapis kompletnego zakończenia przebiegu powinny zachować wspólny los. Awaria pomiędzy niezależnymi zapisami mogłaby pozostawić stan, którego dotychczasowa transakcja nie dopuszczała. Synchronizacja utrzymuje też blokadę sesji podczas pobierania; utrata połączenia musi nadal odbierać wykonawcy możliwość bezpiecznego kontynuowania chronionej pracy.

### Propozycja do oceny

Przed niezależnym wdrażaniem tych zadań warto uzgodnić, kto rozpoczyna transakcję, jak przekazuje ją uczestniczącym operacjom i jak długo utrzymywane są blokady. Operacja uczestnicząca we wspólnej transakcji nie powinna po cichu zastępować jej własną, niezależną transakcją. Zwykły odczyt do widoku i odczyt chroniący późniejszy zapis mogą wymagać odrębnych warunków użycia.

Uzgodnienie powinno też objąć zbiorcze odczyty Źródeł i Profilu. Rozbicie istniejącego zapytania nie powinno zmieniać listy stu pozycji w sto osobnych zapytań.

Dowodem zachowania reguł byłyby scenariusze wycofania finalizacji, utraty sesji pobierania, powtórnego dostarczenia tej samej pracy oraz równoległej zmiany profilu lub ogłoszenia podczas publikacji. Propozycja dotyczy doprecyzowania istniejącej zasady architektury; nie wymaga z góry wyboru nowego mechanizmu transakcji.

## F4. Wynik AI, jego publikacja i koszt mają odrębne warunki powodzenia

**Dotyczy:** `.9` — propozycja profilu przez AI, `.11` — usunięcie obejść między modułami; powiązane zadania epiku `oferty-pracy-334`.

### Kontekst i ustalenie

Moduł AI wykonuje zlecenie i rozlicza koszt. Moduł korzystający z wyniku ocenia, czy można go zastosować do aktualnych danych. Wygenerowanie odpowiedzi nie jest więc równoznaczne z jej publikacją, czyli zapisaniem wyniku jako obowiązującej propozycji lub oceny.

Sprawdzony kod zawiera już zabezpieczenia: płatna ścieżka profilu rozlicza próbę i aktualizuje import we wspólnej transakcji, a lokalna sprawdza tożsamość wykonania, uprawnienie do publikacji i wersję tekstu wejściowego. Opisy nowych granic modułów nie ustalają jednak pełnego sposobu przekazywania trwałego wyniku, odzyskiwania publikacji i rozliczania próby.

Istotna jest również różnica między sprawdzeniem budżetu a jego rezerwacją. Istniejąca funkcja używana przy rezerwowaniu środków blokuje i sprawdza budżet, ale sama nie zapisuje trwałej rezerwacji. Wystawienie jej pod nową publiczną nazwą nie zapewni kompletnej operacji rezerwowania środków.

### Dlaczego to ma znaczenie

Model może już zwrócić płatny wynik, a aplikacja przerwać pracę przed jego publikacją. Po wznowieniu powinna móc wykorzystać zachowany wynik zamiast ponownie wywoływać model. Jeśli w międzyczasie zmieniły się dane wejściowe, publikacja może zostać odrzucona, lecz poniesiony koszt nadal wymaga rozliczenia.

Niepełna umowa między modułami grozi więc utratą wyniku, powtórnym kosztem albo zastosowaniem odpowiedzi do nieaktualnych danych. Przeniesienie funkcji do modułu AI samo nie rozwiązuje tych przypadków.

### Propozycja do oceny

Warto określić pełny przebieg: zlecenie, utrwalenie wyniku, jego odczyt, sprawdzenie warunków publikacji, publikację oraz rozliczenie. Potrzebny jest też właściciel operacji łączącej działania kilku modułów i reguła wznowienia po przerwaniu. Dla grup ocen trzeba wyjaśnić, jak rezerwuje się budżet całej grupy i rozlicza poszczególne próby.

Decyzja musi uwzględnić istniejące dane i prace w kolejce: ich identyfikatory, prace oczekujące oraz wykonania, których wynik pozostaje niepewny. Dopiero na tej podstawie można ocenić, czy obecny zapis wystarcza, czy potrzebne jest rozszerzenie schematu danych.

Zasadność rozwiązania można sprawdzić przez przerwanie między generacją a publikacją, ponowne dostarczenie pracy, próbę publikacji starego wyniku i rozliczenie kosztu mimo odrzucenia treści. Rekomendacją jest wykorzystanie istniejących mechanizmów; przegląd nie wykazał potrzeby budowy nowego silnika wykonywania zadań.

## F5. Zależności i podział odpowiedzialności nie wskazują jednoznacznej kolejności pracy

**Dotyczy:** `.1`, `.6`, `.8`, `.9`, `.11`, `.12`.

### Kontekst i ustalenie

Zależność między zadaniami oznacza, że jedno potrzebuje konkretnego rezultatu drugiego. W sprawdzonym epiku zapisano część takiej kolejności: `.2` zależy od `.1`, `.5` od `.2`, `.3` i `.4`, a `.7` od `.5`.

Pozostały jednak luki. Zadanie `.11` wymaga odczytu ogłoszeń tworzonego w `.6`, ale w sprawdzonym grafie nie miało tej zależności. Zadanie `.12` obejmuje przenoszenie plików, które częściowo należy już do `.1` i `.8`. Samo polecenie „skoordynować” nie rozstrzyga, kto wykonuje wspólny fragment.

Zadania `.9` i `.11` odwołują się również do prac nad AI w epiku `oferty-pracy-334`. Otwarty status tych prac nie dowodzi, że wymagany kod nie istnieje: część mechanizmów została dostarczona, a pozostały odbiór obejmuje także osobne sprawdzenia w działającym środowisku.

### Możliwy skutek i propozycja do oceny

Wykonawca może rozpocząć pracę bez potrzebnego interfejsu, stworzyć jego własny wariant albo ponownie przenieść pliki zmienione przez inne zadanie. Przeciwne ryzyko to niepotrzebne oczekiwanie na cały sąsiedni epik, mimo że potrzebny fragment jest już dostępny.

Propozycją jest zapisanie zależności `.11` od `.6` oraz przypisanie każdej grupy przenosin jednemu zadaniu. Jednym z możliwych wariantów jest pozostawienie w `.12` tylko tego, czego nie przenoszą `.1` i `.8`; wybór kolejności pozostaje decyzją właściciela projektu.

Dla integracji AI warto wskazać konkretne wymagane rezultaty z zadań `334.2`–`334.6` oraz rozdzielić odpowiedzialność `.9` i `.11` za wspólne operacje prób AI. Pozwoli to ocenić rzeczywiste blokady bez utożsamiania braku odbioru całego zadania z brakiem potrzebnego kodu.

## F6. Przeniesienie plików może zmienić sposób uruchamiania aplikacji

**Dotyczy:** `.8` — moduł Oferty, `.12` — katalogi modułów, częściowo `.1` — konektory.

### Kontekst i ustalenie

Opis „przenieść wszystkie pliki należące do modułu” nie rozstrzyga granicy między logiką modułu a widokiem, trasą HTTP, poleceniem terminala, obsługą kolejki i testami. Część tych plików musi pozostać w lokalizacji rozpoznawanej przez framework albo zachować punkt wejścia w dotychczasowym miejscu.

Przegląd wskazał również zależności od lokalizacji plików: adaptery uruchamiają skrypty Python po określonych ścieżkach, a testy znają te lokalizacje. Konfiguracja sprawdzania typów narzędzi nie wymieniała katalogu `modules/` wprost. Importowane pliki mogą być nadal sprawdzane, ale nowe samodzielne punkty wejścia wymagają uwzględnienia.

### Dlaczego to ma znaczenie

Poprawienie importów TypeScript nie gwarantuje, że worker nadal znajdzie skrypt Python lub że nowe narzędzie zostanie sprawdzone przed uruchomieniem. Dodatkowo wspólny publiczny plik eksportów modułu może połączyć kod widoku z zależnościami serwera. Wtedy import potrzebny przeglądarce może niezamierzenie wciągnąć kod dostępu do bazy.

### Propozycja do oceny

Przed przenosinami warto ustalić mapę obecnych i docelowych lokalizacji, wskazać pozostające punkty wejścia oraz potrzebne zmiany uruchamiania i konfiguracji. Mapa byłaby materiałem wykonawczym zadania; raport nie musi powielać całej listy plików.

Plan powinien również wyjaśniać, jak publicznie udostępnić kod potrzebny widokom bez dołączania zależności serwerowych. Zmienione punkty wejścia i integracje powinny znaleźć odzwierciedlenie w diagramach architektury. Brak docelowych plików przed refaktorem jest naturalny; uwaga dotyczy nieustalonego zakresu przenosin i ich skutków.

## F7. Wynik testów trzeba odnieść do scenariuszy, które rzeczywiście wykonano

**Dotyczy:** całego epiku, szczególnie `.8`, `.9`, `.11`, `.12`.

### Kontekst i ustalenie

Kryteria odbioru wymieniają część zachowań do zachowania, lecz nie wskazują jednoznacznie, jak zostaną sprawdzone. W istniejącej konfiguracji testy integracyjne są pomijane bez `RUN_INTEGRATION=1`. Wymagają przygotowania izolowanych schematów aplikacji i kolejki; ich pliki wykonują się szeregowo z powodu blokad obejmujących bazę. Część testów adapterów Python wymaga dodatkowo `JOBSPY_PYTHON`.

Oznacza to, że poprawny wynik zwykłego `pnpm test` może nie obejmować scenariuszy najważniejszych dla tego refaktoru: transakcji, blokad, kolejki i zapisu danych.

### Możliwy skutek i propozycja do oceny

Bez powiązania kryteriów z uruchomionymi kontrolami łatwo uznać zadanie za sprawdzone, choć testy wymaganej ścieżki zostały pominięte. Ryzyko dotyczy siły dowodu odbioru, a nie samej liczby testów.

Propozycją jest przypisanie kryteriom odpowiednich istniejących zestawów i brakujących scenariuszy. Plan powinien obejmować sprawdzenie typów przez `pnpm check`, kompilację przez `pnpm build`, integracje uruchomione w przygotowanej izolowanej bazie oraz testy używanych adapterów Python.

Najważniejsze obszary to zapis i kompletność pobrania, listy i historia ocen, zmiany profilu, publikacja wyników AI oraz koszty grup i researchu firm. Samo istnienie testów w tych obszarach nie potwierdza pokrycia nowych kryteriów. Większość zachowań można sprawdzić z atrapami źródeł i modeli, bez płatnych wywołań. Wynik odbioru powinien odróżniać wykonane kontrole od pominiętych i zablokowanych przez środowisko.

## F8. Grupowanie ogłoszeń należy do modułu Oferty

**Dotyczy:** `.8` i mapy modułów. **Rozstrzygnięte.**

Moduł Oferty grupuje ogłoszenia dotyczące tej samej rekrutacji w jedną ofertę pracy. Jest to ustalona odpowiedzialność modułu, a nie opcjonalny kierunek jego rozwoju. Moduł Źródła ofert odpowiada za poszczególne publikacje i nie przejmuje grupowania.

Odpowiedzialność modułu należy odróżnić od zakresu wdrożenia: zadanie `.8` porządkuje istniejący kod i zachowuje działanie listy oraz szczegółów. Wdrożenie funkcji grupowania pozostaje poza zakresem tego refaktoru. Opisy nie powinny ani podawać w wątpliwość właściciela tej funkcji, ani sugerować, że samo uporządkowanie kodu ją dostarcza.

## Jak uwagi wpływają na ocenę poszczególnych zadań

Tabela zbiera ocenę przygotowania do realizacji, a nie status wykonania w Beads. „Warunkowo” oznacza, że cel zadania jest wystarczająco jasny, lecz wykonanie wymaga wspólnego ustalenia wskazanego w raporcie. Ocena pochodzi z przeglądu z 13 listopada, z uwzględnieniem doprecyzowania F1 w `.4`.

| Zadanie | Ocena przygotowania | Co wymaga uwagi |
| --- | --- | --- |
| `.1` — interfejs konektorów | Wymaga doprecyzowania współpracy i zakresu przenosin. | Znaczenie porcji, błędów i kompletności oraz zachowanie różnic źródeł — F2, F6. |
| `.2` — wybór konektora (`ConnectorProvider`) | Blisko gotowości po ustaleniu interfejsu z `.1`. | Powiązanie źródła z konektorem i reakcja na nieprawidłową rejestrację — F2. |
| `.3` — metadane przebiegu | Warunkowo przygotowane. | Liczniki, granica transakcji i blokady — F2, F3. |
| `.4` — zapis wyników | F1 doprecyzowano; pozostały wspólne ustalenia. | Wynik zapisu, liczniki i uczestnictwo w transakcji — F2, F3. |
| `.5` — wykonanie kolektora | Wymaga doprecyzowania wspólnego przebiegu. | Zachowanie różnic pobierania oraz ochrona wykonania — F2, F3. |
| `.6` — odczyt ogłoszeń | Wymaga określenia warunków publicznego odczytu. | Wyniki zbiorcze i odczyty chroniące późniejszy zapis — F3. |
| `.7` — reguła dostępności | Warunkowo przygotowane po `.5`. | Warunki wnioskowania z braku oraz wspólne wycofanie zmian z finalizacją — F1, F3. |
| `.8` — moduł Oferty | Jasny cel, niepełny plan wykonania. | Podział z `.12`, przenosiny, granica widoku i serwera oraz odbiór — F5, F6, F7. |
| `.9` — propozycja profilu przez AI | Wymaga ustaleń przed samodzielną realizacją. | Trwały wynik, publikacja, koszt i zależności od prac AI — F4, F5, F7. |
| `.10` — odczyt Profilu | Najbliżej gotowości w pierwotnej ocenie. | Wspólny sposób uczestniczenia w transakcji i utrzymania blokad — F3. |
| `.11` — usunięcie obejść między modułami | Wymaga ustaleń przed samodzielną realizacją. | Dostępność potrzebnych odczytów, współpraca z AI i kolejność zmian — F3, F4, F5, F7. |
| `.12` — katalogi modułów | Wymaga ustalenia pozostałego zakresu. | Właściciel przenosin, mapa zmian i sposób sprawdzenia uruchamiania — F5, F6, F7. |

Etykieta `ready-for-agent` nie usuwa opisanych luk. W pierwotnym przeglądzie dotyczyło to szczególnie `.9`, `.11` i `.12`: ich samodzielne wykonanie wymagałoby podejmowania decyzji wykraczających poza jednoznaczny opis zadania.

## Wniosek dla decyzji o dalszej pracy

Przegląd nie daje podstaw do odrzucenia przyjętego podziału na moduły. Wskazuje natomiast miejsca, w których opis refaktoryzacji pozostawia zbyt wiele możliwych interpretacji. Największe znaczenie mają trzy wspólne ustalenia: zasady pobierania i zapisu wyników, udział modułów w transakcjach oraz przekazywanie i rozliczanie wyników AI. Od nich zależy spójność kilku zadań jednocześnie.

F1 ma już zapisane rozgraniczenie w zadaniu o zapisie wyników. Dla pozostałych uwag decyzja właściciela dotyczy najpierw zasadności proponowanych uzupełnień, a następnie miejsca i zakresu ich zapisania w ticketach. Ustalenie odpowiedzialności za przenosiny oraz sposobu odbioru pozwoli potem uporządkować kolejność realizacji. Raport dostarcza podstaw do tych decyzji; nie zmienia samodzielnie zakresów, zależności ani statusów zadań.
