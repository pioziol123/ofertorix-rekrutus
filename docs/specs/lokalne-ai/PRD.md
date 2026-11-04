# Lokalne AI i research przez OpenCode — PRD

Status: **projekt do przeglądu**, 2026-11-04. Dokument przygotowany na zlecenie właściciela. Potwierdzone wybory zapisano poniżej; pozostały zakres jest propozycją. Przygotowanie PRD nie oznacza akceptacji całej specyfikacji ani rozpoczęcia implementacji.

## Kontekst i źródła

Właściciel chce wykorzystywać lokalne modele Ollamy w istniejącej aplikacji oraz lokalnego agenta do researchu pracodawcy. Inicjatywa rozszerza sposoby wykonania AI opisane w [PRD pierwszej wersji](../pierwsza-wersja/PRD.md). Zachowuje pojęcia i reguły profilu zawodowego, dopasowania oferty oraz researchu pracodawcy.

Źródłem decyzji produktowych jest rozmowa z właścicielem z 2026-11-04. [Plan wdrożenia](README.md) i [SD](solution-design.md) zapisują wcześniejsze rozpoznanie oraz proponowane granice techniczne. [Wymagania LA-01–LA-10](requirements.md) zawierają szczegółowe zachowanie i kryteria akceptacji. Status prac i zależności utrzymuje Beads: `bd show oferty-pracy-334`.

### Potwierdzone decyzje

- Lokalny model: **`gpt-oss:20b` w Ollamie**, bez wariantu chmurowego.
- Agent researchu: **OpenCode**. Pętlę pracy agenta prowadzi OpenCode; aplikacja zleca pracę, sprawdza wynik i zapisuje go w domenie.
- **Bez aplikacyjnych limitów korzystania z Ollamy**: budżetu, kwot tokenów, liczby wywołań i rund oraz stałego terminu przerwania całej lokalnej pracy. Nie wprowadzamy też sztucznego ograniczenia do jednego równoległego wywołania.
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

Pilot powinien zapisać czas wykonania, poprawność wyników, odrzucone odpowiedzi i przyczyny błędów na ustalonym małym zestawie przykładów. Przegląd właściciela oceni przydatność uzasadnień i raportów. Nie ustalono liczbowych progów jakości, czasu ani oszczędności; nie są obietnicą tego PRD. Poprawny format odpowiedzi sam nie dowodzi jej użyteczności.

## Proponowany zakres

### Profil zawodowy

Właściciel importuje CV i zleca przygotowanie propozycji przez lokalny model. Propozycja podlega dotychczasowej kontroli zgodności z materiałem źródłowym i zatwierdzeniu przez właściciela. Brak klucza OpenAI lub cennika płatnego modelu nie blokuje lokalnej ścieżki.

### Dopasowanie ofert

Właściciel zleca ocenę jednej oferty albo grupy ofert. Lokalne wykonanie zachowuje te same zasady dopasowania, odróżniania braków od niewiadomych oraz aktualności oceny. Widoczny jest wynik każdej pozycji; poprawne wyniki pozostają dostępne po błędzie pozostałych. Ponowne dostarczenie tego samego wyniku nie tworzy kolejnej oceny w historii.

### Research podstawowy

Właściciel ręcznie uruchamia research firmy. OpenCode korzysta z lokalnego modelu oraz uzgodnionych narzędzi wyszukiwania i odczytu publicznych stron. Aplikacja sprawdza raport i dowody przed publikacją. Agent nie zmienia samodzielnie profilu firmy, powiązań organizacji ani innych danych aplikacji.

Istniejący raport może być wykorzystany ponownie zgodnie z dotychczasowymi zasadami. Jawne żądanie ponownego researchu tworzy nową wersję dopiero po poprawnym zakończeniu. Nieudane wykonanie nie zastępuje poprzedniego raportu. Brak źródeł nie uprawnia do przedstawienia przypuszczeń jako ustaleń.

### Wybór wykonania i ciągłość pracy

Proponujemy niezależny wybór wykonania dla profilu, ocen i researchu. Możliwa jest instalacja mieszana, np. lokalny profil i oceny oraz research przez OpenAI. Pierwsze wydanie może korzystać z konfiguracji serwerowej; nowy ekran ustawień nie jest wymagany.

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
- Sesje i konfiguracja dedykowanego OpenCode wymagają izolacji od prywatnej konfiguracji właściciela. Zakres przechowywanych danych i ich retencja muszą być ustalone przed uruchomieniem researchu.
- Dostępność modelu, pamięć i faktyczny kontekst na sprzęcie właściciela wymagają pilota. Zbyt duże wejście ma dać jawny błąd, bez cichego ucięcia danych.

## Poza zakresem

Nie zmieniamy zasad ratingu, decyzji właściciela, importowania ofert, zarządzania rekrutacjami ani kopii zapasowych. Nie realizujemy w tej inicjatywie researchu pogłębionego ani automatycznych progów uruchamiania researchu.

Pierwsze wydanie nie obejmuje automatycznego doboru lub pobierania modeli, fallbacku do chmury, dowolnych narzędzi agenta ani ogólnej platformy agentowej. Nie usuwa obsługi OpenAI i Batch. Nie uruchamia masowej ponownej oceny zapisanych ofert.

## Proponowane etapy produktowe

| Etap | Użyteczny wynik | Powiązanie z planem technicznym |
| --- | --- | --- |
| Przygotowanie | Dotychczasowe AI zachowuje działanie po oddzieleniu odpowiedzialności. | Etapy 1–4. |
| Pierwsze lokalne wydanie | Profil przez `gpt-oss:20b` bez OpenAI, po pilocie wybranego zestawu. | Etap 5; nie wymaga gotowej wyszukiwarki. |
| Lokalne oceny | Oceny pojedyncze i grupowe z historią oraz poprawną obsługą częściowych błędów. | Etap 6. |
| Lokalny agent researchu | Ręczny research podstawowy przez OpenCode z uzgodnionym wyszukiwaniem i walidacją źródeł. | Etapy 7–8. |
| Odbiór i stopniowe włączenie | Zweryfikowane warianty mieszane, ciągłość starych operacji i możliwość zmiany wykonania nowych zleceń. | Etap 9. |

Nie określamy terminów kalendarzowych przed pilotem. Szczegółowe requirements i SD dopracowujemy dla wybranego etapu przed implementacją, zgodnie z [cyklem projektu](../pierwsza-wersja/README.md#cykl-pracy-nad-funkcjonalnością).

## Niewiadome i gotowość

| Kwestia | Konsekwencja i następny krok |
| --- | --- |
| Działanie wybranego modelu i runtime na hoście | O-L1: sprawdzić pamięć, kontekst, poprawność wyników i czas. Model i OpenCode są już wybrane; pilot nie jest ponownym wyborem technologii. |
| Źródło wyszukiwania, dostęp i koszt | O-L2: rozstrzygnąć przed uruchomieniem researchu; nie blokuje lokalnego profilu i ocen. |
| Sesje, anulowanie, restart i retencja OpenCode | O-L3: potwierdzić kontrakt przed integracją agenta; brak kwot lokalnego modelu jest ustalony. |
| Akceptacja dokumentów wykonawczych | O-L4: przejrzeć i uzgodnić requirements/SD podejmowanego etapu. Sam PRD nie nadaje zadaniom gotowości do implementacji. |

Rejestr O-L1–O-L4 i szczegółowe kryteria pozostają w [wymaganiach](requirements.md#decyzje-otwarte). Ten PRD określa proponowany cel i granice inicjatywy; [plan](README.md) określa kolejność, a [SD](solution-design.md) podejście techniczne. Nie potwierdzono jeszcze działania wybranego zestawu w pilocie.

## Dokumentacja etapów — aktualizacja 2026-11-04

Na kolejne zlecenie właściciela przygotowano [Requirements i SD wszystkich dziewięciu etapów](README.md#requirements-i-sd-każdego-etapu). Rozszerza to zakres dokumentacji względem wcześniejszego planu dopracowywania pojedynczej pary. Pary pozostają projektami do przeglądu; przed realizacją aktualizujemy je na podstawie bieżącego kodu i wyników pilotów. Nie oznacza to akceptacji technicznych propozycji ani rozpoczęcia wdrożenia.
