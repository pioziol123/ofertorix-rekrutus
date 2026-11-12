# Lokalne AI i research przez OpenCode — PRD

Status: **zakres i decyzje produktowe zatwierdzone po grill-me**, 2026-11-05. Jeden wspólny zakres wydania obejmuje cały epik wraz z panelem. Etapy porządkują implementację i weryfikację. Dokumentacja nie jest dowodem gotowego wdrożenia.

## Kontekst i źródła

Właściciel chce wykorzystywać lokalne modele Ollamy w istniejącej aplikacji oraz lokalnego agenta do researchu pracodawcy. Inicjatywa rozszerza sposoby wykonania AI opisane w [PRD pierwszej wersji](../pierwsza-wersja/PRD.md). Zachowuje pojęcia i reguły profilu zawodowego, dopasowania oferty oraz researchu pracodawcy.

Źródłem decyzji produktowych jest rozmowa z właścicielem z 2026-11-04. [Plan wdrożenia](README.md) i [SD](solution-design.md) zapisują wcześniejsze rozpoznanie oraz proponowane granice techniczne. [Wymagania LA-01–LA-21](requirements.md) zawierają szczegółowe zachowanie i kryteria akceptacji. Status prac i zależności utrzymuje Beads: `bd show oferty-pracy-334`.

### Potwierdzone decyzje

- Lokalny model: **`gpt-oss:20b` w Ollamie**, bez wariantu chmurowego.
- Agent researchu: **OpenCode**. Pętlę pracy agenta prowadzi OpenCode; aplikacja zleca pracę, sprawdza wynik i zapisuje go w domenie.
- **Bez aplikacyjnych limitów korzystania z Ollamy**: budżetu, kwot tokenów, liczby wywołań i rund oraz stałego terminu przerwania całej lokalnej pracy. Ze względu na zasoby komputera wszystkie lokalne prace AI — profil, pojedyncze oceny i research — korzystają ze wspólnej kolejki z jednym aktywnym wykonaniem.
- Prace pozostają na etapie dokumentacji i uzgodnienia architektury.

Parametry fizycznego kontekstu modelu, walidacja danych, anulowanie i obsługa awarii pozostają potrzebne. Nie są kwotami korzystania z lokalnego modelu.

## Problem i odbiorca

Odbiorcą jest właściciel osobistego systemu ofert pracy. Chce korzystać z AI przy budowaniu profilu zawodowego, ocenie ofert i researchu firm, wybierając lokalne wykonanie tych zadań.

Dotychczasowe ścieżki są związane z OpenAI: profil korzysta z wywołania modelu, oceny z Batch, a research z wyszukiwania i syntezy u tego dostawcy. Opis tego stanu znajduje się w [SD](solution-design.md). Dodanie samego adresu lokalnego modelu nie zapewnia jeszcze obsługi całego procesu, w szczególności wyszukiwania źródeł i utrzymania pracy agenta.

Zmiana ma umożliwić wykonanie tych samych czynności z lokalnym modelem przy zachowaniu jakości kontroli danych, historii i widocznego stanu operacji. Nie zakładamy z góry, że lokalny model będzie szybszy albo równie trafny jak dotychczasowy. Te właściwości wymagają oceny na sprzęcie właściciela.

## Oczekiwane rezultaty i dowody użyteczności

| Rezultat dla właściciela | Dowód podczas odbioru |
| --- | --- |
| Może przygotować profil bez OpenAI. | Propozycja z `gpt-oss:20b` ma poprawne odniesienia do CV i zmienia profil dopiero po zatwierdzeniu. |
| Może oceniać oferty pojedynczo i zbiorczo lokalnie. | Wyniki zachowują reguły dowodów, niewiadomych, ratingu i historii; częściowy błąd nie usuwa poprawnych ocen. |
| Może zlecić agentowi research podstawowy. | Raport OpenCode zawiera sprawdzalne źródła i daty, rozróżnia fakty, opinie i niewiadome oraz przechodzi walidację aplikacji. |
| Rozpoznaje wykonawcę, stan i koszt operacji. | Historia wskazuje dostawcę i model, a błąd lub przerwanie nie wygląda jak ukończony wynik. Lokalny koszt API wynosi zero; ewentualne koszty narzędzi są odrębne. |
| Może włączać lokalne wykonanie bez utraty dotychczasowej pracy. | Stare wyniki i aktywne operacje OpenAI pozostają obsługiwane, a zmiana konfiguracji dotyczy nowych zleceń. |

Nie wymagamy osobnego pilota ani benchmarku jakości odpowiedzi. Właściciel ocenia przydatność podczas normalnego używania, np. po uruchomieniu propozycji profilu. Obowiązują testy techniczne, kontrola formatu, dowodów i stanów operacji; dostępność modelu sprawdzamy przez GET /api/tags.

## Proponowany zakres

### Profil zawodowy

Właściciel importuje CV i zleca przygotowanie propozycji przez lokalny model. Propozycja podlega dotychczasowej kontroli zgodności z materiałem źródłowym i zatwierdzeniu przez właściciela. Brak klucza OpenAI lub cennika płatnego modelu nie blokuje lokalnej ścieżki.

### Dopasowanie ofert

Właściciel zleca ocenę jednej oferty albo grupy ofert. Lokalne wykonanie zachowuje te same zasady dopasowania, odróżniania braków od niewiadomych oraz aktualności oceny. Widoczny jest wynik każdej pozycji; poprawne wyniki pozostają dostępne po błędzie pozostałych. Ponowne dostarczenie tego samego wyniku nie tworzy kolejnej oceny w historii.

### Research podstawowy

Właściciel ręcznie uruchamia research firmy. OpenCode korzysta z lokalnego modelu oraz uzgodnionych narzędzi wyszukiwania i odczytu publicznych stron. Aplikacja sprawdza raport i dowody przed publikacją. Agent nie zmienia samodzielnie profilu firmy, powiązań organizacji ani innych danych aplikacji.

Istniejący raport może być wykorzystany ponownie zgodnie z dotychczasowymi zasadami. Jawne żądanie ponownego researchu tworzy nową wersję dopiero po poprawnym zakończeniu. Nieudane wykonanie nie zastępuje poprzedniego raportu. Brak źródeł nie uprawnia do przedstawienia przypuszczeń jako ustaleń.

### Wybór wykonania i ciągłość pracy

Właściciel potwierdził 2026-11-05 niezależny wybór modelu i sposobu wykonania dla profilu, ocen i researchu; zakres decyzji zapisują [wymagania przekrojowe](requirements.md#doprecyzowanie-potwierdzone-2026-11-05). Możliwa jest instalacja mieszana, np. lokalny profil i oceny oraz research przez OpenAI. Pierwsze wydanie korzysta z potwierdzonej konfiguracji serwerowej w `.env`; nowy ekran ustawień nie jest wymagany.

Zlecenie zachowuje wybór wykonawcy i modelu z chwili utworzenia. Niedostępność lokalnego modelu nie powoduje automatycznego wysłania danych do chmury. Właściciel widzi przyczynę niepowodzenia i może anulować lokalną pracę. Restart nie może uruchomić drugiego agenta dla nadal aktywnego researchu ani ponownie opublikować ukończonych wyników.

## Typowe przebiegi

**Pierwszy lokalny profil.** Po skonfigurowaniu Ollamy właściciel importuje CV bez klucza OpenAI. Otrzymuje propozycję z oznaczeniem modelu, przegląda ją i zatwierdza. Błędne cytaty powodują odrzucenie propozycji; zapisany profil pozostaje dostępny.

**Grupa ofert.** Właściciel zleca lokalne oceny. Część kończy się poprawnie, a jedna odpowiedź jest nieprawidłowa. Poprawne oceny są dostępne, pozostała pozycja ma jawny stan błędu. Restart nie publikuje ponownie wcześniej ukończonych ocen.

**Research firmy.** OpenCode wyszukuje materiały i odczytuje strony. Raport wskazuje pochodzenie ustaleń. Jeśli źródła nie potwierdzają warunków pracy, raport pozostawia tę kwestię niewiadomą. Nie przenosi technologii klienta na pośrednika bez odpowiednich dowodów.

**Niedostępna usługa lub przerwanie.** Model albo OpenCode staje się niedostępny, bądź właściciel anuluje pracę. Operacja otrzymuje czytelny stan. Poprzednie wyniki pozostają dostępne; dane nie są automatycznie kierowane do innego dostawcy.

**Zmiana konfiguracji.** Przy aktywnych operacjach właściciel wybiera inne wykonanie dla kolejnych zleceń. Oczekujące zadania zachowują wcześniejszy wybór; starsze partie OpenAI mogą zostać odebrane i zakończone. Powrót do OpenAI nie usuwa lokalnej historii.

## Ograniczenia i granice danych

- Lokalna inferencja ma koszt API równy zero. Nie oznacza to zerowego kosztu energii, sprzętu ani zewnętrznych narzędzi. Wyczerpanie budżetu usług płatnych nie blokuje pracy korzystającej wyłącznie z lokalnego modelu.
- Brak kwot Ollamy nie znosi uzgodnionej kontroli kosztów płatnego wyszukiwania ani technicznej ochrony odczytu stron. Nie wolno zastąpić nim limitu rund lub czasu całego lokalnego zadania.
- Research korzysta z internetu. Zapytania trafiają do wybranego źródła wyszukiwania, a odczyt odwiedza strony publiczne. Wyszukiwarka nie otrzymuje CV ani pełnego profilu zawodowego.
- Agent ma dostęp wyłącznie do uzgodnionych narzędzi researchu. Nie otrzymuje powłoki, plików projektu, prywatnej sieci ani możliwości zapisu danych domenowych. Treść strony nie rozszerza jego uprawnień.
- Sesje i konfiguracja dedykowanego OpenCode wymagają izolacji od prywatnej konfiguracji właściciela. Potwierdzono bezterminowe zachowanie zebranych materiałów tej integracji. Profil Chrome z cookies/cache jest wyjątkiem: usuwalny stan roboczy po potwierdzonym zakończeniu i archiwizacji materiałów.
- Obecność modelu sprawdzamy przez GET /api/tags; nie wymagamy pilota jakości odpowiedzi. Zbyt duże wejście ma dać jawny błąd, bez cichego ucięcia danych.

## Poza zakresem

Nie zmieniamy zasad ratingu, decyzji właściciela, importowania ofert, zarządzania rekrutacjami ani kopii zapasowych. Nie realizujemy w tej inicjatywie researchu pogłębionego ani automatycznych progów uruchamiania researchu.

Pierwsze wydanie nie obejmuje automatycznego doboru lub pobierania modeli, fallbacku do chmury, dowolnych narzędzi agenta ani ogólnej platformy agentowej. Nie usuwa obsługi OpenAI i Batch. Nie uruchamia masowej ponownej oceny zapisanych ofert.

## Etapy implementacji jednego wydania

| Etap | Użyteczny wynik | Powiązanie z planem technicznym |
| --- | --- | --- |
| Przygotowanie | Dotychczasowe AI zachowuje działanie po oddzieleniu odpowiedzialności. | Etapy 1–4. |
| Adapter i lokalny profil | Profil przez `gpt-oss:20b` bez OpenAI, ze sprawdzeniem dostępności przez API. | Etap 5; nie wymaga gotowej wyszukiwarki. |
| Lokalne oceny | Oceny pojedyncze i grupowe z historią oraz poprawną obsługą częściowych błędów. | Etap 6. |
| Lokalny agent researchu | Ręczny research podstawowy przez OpenCode z uzgodnionym wyszukiwaniem i walidacją źródeł. | Etapy 7–8. |
| Odbiór i wspólne wdrożenie | Zweryfikowane warianty mieszane, ciągłość starych operacji i możliwość zmiany wykonania nowych zleceń. | Etap 9. |

Właściciel zatwierdził wspólne wdrożenie całego epiku, bez osobnego wydania samego profilu lub ocen. Nie określamy terminów kalendarzowych przed technicznym sprawdzeniem integracji. Szczegółowe requirements i SD dopracowujemy dla wybranego etapu przed implementacją, zgodnie z [cyklem projektu](../pierwsza-wersja/README.md#cykl-pracy-nad-funkcjonalnością).

## Niewiadome i gotowość

| Kwestia | Konsekwencja i następny krok |
| --- | --- |
| Działanie wybranego modelu i runtime na hoście | O-L1: sprawdzić dostęp do API i obecność skonfigurowanego modelu; bez benchmarku jakości. Model i OpenCode są już wybrane. |
| Źródło wyszukiwania, dostęp i koszt | O-L2: Google przez Chrome DevTools MCP wybrane; przed live wymagane T03–T05, bez blokowania profilu/ocen. |
| Sesje, anulowanie, restart i retencja OpenCode | O-L3: kontrakt HTTP/sesji/kolejki opisany; przed live wymagane T01/T02. Retencja zamknięta: zebrane materiały bezterminowo, roboczy profil Chrome usuwalny po końcu; brak kwot jest ustalony. |
| Akceptacja dokumentów wykonawczych | O-L4: przegląd wykonawczy par zakończony w334.19/20; przed kodem odświeżyć zastane zmiany. Beads wskazuje gotowość i niezakończone zależności. |

Rejestr O-L1–O-L4 i szczegółowe kryteria pozostają w [wymaganiach](requirements.md#rozstrzygnięcia-i-warunki-techniczne). Ten PRD określa zatwierdzony cel i granice inicjatywy; [plan](README.md) określa kolejność, a [SD](solution-design.md) podejście techniczne. Nie potwierdzono jeszcze działania wybranego zestawu w pilocie.

## Dokumentacja etapów — aktualizacja 2026-11-04

Na kolejne zlecenie właściciela przygotowano [Requirements i SD wszystkich dziewięciu etapów](README.md#requirements-i-sd-każdego-etapu). Rozszerza to zakres dokumentacji względem wcześniejszego planu dopracowywania pojedynczej pary. Przegląd wykonawczy przeprowadzono 2026-11-05 w334.19/20; kontrakty doprecyzowano i zadania mają gotową specyfikację. Przed realizacją odświeżyć stan kodu i wyniki poprzedników. Nie oznacza to wykonania testów ani rozpoczęcia wdrożenia.

Aktualizacja decyzji 2026-11-05: konfiguracja `.env`, bezterminowe zachowanie zebranych materiałów z wyjątkiem roboczego profilu Chrome, sprawdzanie modelu przez API bez pilota jakości oraz porcjowanie lokalnych ocen do 20 opisane są w [wymaganiach przekrojowych](requirements.md#doprecyzowanie-potwierdzone-2026-11-05). Próby techniczne API/sesji nie są testem jakości modelu.

## Panel operacji i wyszukiwanie — rozszerzenie 2026-11-05

Właściciel zlecił panel zarządzania zadaniami z możliwością ręcznego sprawdzenia, zatrzymania i pominięcia. Szczegóły i rozstrzygnięcia opisuje [osobna para Requirements/SD](features/panel-zadan/requirements.md). Reguły pomijania, ponawiania i wznowienia zostały następnie potwierdzone w wymaganiach panelu. Wyszukiwanie ma korzystać z Google przez przeglądarkę. Wybrano Chrome DevTools MCP i interwencję użytkownika; realizację określają kontrakty runtime i ich bramki techniczne.

## Potwierdzenie panelu — 2026-11-05

Pierwszy zakres to zadania AI. Akcje obejmują pojedynczą pozycję albo grupę do 20, nie całe zlecenie nadrzędne. Pomiń próbuje zatrzymać i blokuje publikację, pozwalając kontynuować grupę. Jawne ponowienie jest dozwolone także przy running/unknown: poprzednie wykonanie traci prawo publikacji i otrzymuje próbę zatrzymania; jego późną odpowiedź zachowujemy do wglądu. Automatyczne recovery nadal nie uruchamia duplikatu. Pozostałe potwierdzone reguły: [panel zadań](features/panel-zadan/requirements.md). Flow Google przez dedykowaną przeglądarkę z interwencją użytkownika przy blokadzie został zaakceptowany.

Potwierdzona decyzja 2026-11-05: OpenCode steruje dedykowanym Google Chrome przez **Chrome DevTools MCP** (`chrome-devtools-mcp`). Playwright MCP nie wchodzi do wybranej integracji. Szczegóły: [SD etapu 7](etapy/07-narzedzia-www/solution-design.md). Wybór nie oznacza uruchomienia implementacji ani instalacji usług.

## Potwierdzenie organizacji lokalnej pracy — 2026-11-05

Ze względu na zasoby komputera zadania agentów OpenCode czekają w kolejce i wykonują się pojedynczo w całej instalacji. Nie wprowadza to kwot tokenów, rund ani czasu pracy Ollamy; wspólna kolejka obejmuje również profil i pojedyncze oceny. Potwierdzono czysty stan przeglądarki dla nowego wykonania, publiczne strony bez logowania, cookies zachowane podczas wznowienia tego samego wykonania, zakres archiwum dowodów, osobne lokalne usługi i ręczne „Wznów”. Kanoniczne reguły i kryteria: [LA-11–LA-15](requirements.md#kolejka-agentów-przeglądarka-i-wznowienie--potwierdzone-2026-11-05).

## Rozstrzygnięcia końcowe grill-me — 2026-11-05

Jedno wspólne wdrożenie, jedna lokalna praca AI naraz, ręczne ponawianie z niezmienną migawką i ręczna obsługa awarii usług. Google służy tylko do znalezienia źródeł; ustalenia wymagają odczytanych publicznych stron. Zapytania nie zawierają danych profilu właściciela. Agent próbuje pozostałych znalezionych publicznych źródeł i może zakończyć kategorie jawnymi niewiadomymi. Nie musi znaleźć wszystkich odpowiedzi. Stan roboczy Chrome można usunąć po zakończeniu, ale raporty, materiały i historia pozostają. Kryteria normatywne: LA-11/13 i LA-16–LA-21 w [Requirements](requirements.md).

Logowanie i odkładanie sesji tak, aby wykonywać następne zadania, pozostają poza wydaniem w backlogu `oferty-pracy-281`. Obecnie oczekiwanie na interwencję w publicznym dostępie blokuje wspólną lokalną kolejkę. Żadne z tych ustaleń nie dodaje benchmarku jakości odpowiedzi.

## Doprecyzowanie środowiska przeglądarki — 2026-11-05

Na sugestię właściciela projekt techniczny przewiduje headless Chrome w dedykowanym kontenerze, dostępny przez Chrome DevTools MCP. Zachowujemy możliwość podglądu i ręcznej obsługi publicznej blokady w tej samej sesji przez DevTools oraz Wznów w panelu. Nie wymaga to osobistego Chrome ani jego profilu do pracy agenta. Kwalifikacja musi potwierdzić izolację i możliwość interwencji; sam tryb headless nie jest ich dowodem.
