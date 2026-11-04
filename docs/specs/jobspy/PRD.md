# Fork JobSpy dla osobistego systemu ofert pracy — PRD

Status: **zaakceptowany do realizacji etapami**, 2026-11-02. Właściciel polecił wdrażać według dotychczasowego flow i zgłaszać wątpliwości. Otwarte warunki uruchomienia źródeł pozostają otwarte. Fork: [pioziol123/JobSpy](https://github.com/pioziol123/JobSpy). Postęp prac: `bd show oferty-pracy-y81`.

## Kontekst i źródła

Właściciel chce wykorzystać własny fork [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) do rozszerzania źródeł ofert w osobistym systemie. Ten PRD rozwija propozycję zmian omówioną po [analizie repozytorium](../../research/jobspy.md). Analiza z 2026-11-02 obejmowała README i kod gałęzi `main`, bez prób pobierania ofert na żywo; nie potwierdzono konkretnego SHA ani sprawności adapterów.

To osobna inicjatywa rozwoju integracji. Nie zmienia kryteriów odbioru [pierwszej wersji aplikacji](../pierwsza-wersja/PRD.md), opartej na SOLID.Jobs, ani nie wymaga przebudowy działającego importera. Kolejność względem pozostałych prac nad aplikacją wymaga decyzji właściciela.

**Potwierdzone w rozmowie:** system jest osobisty, działa lokalnie lub na własnym VPS; obecny zakres poszukiwań to PHP na poziomie senior. Po przygotowaniu PRD właściciel zlecił jego wdrażanie etapami. Aktualna kolejność: Indeed na końcu, wcześniej podłączenie pozostałych adapterów z jawnym wskazaniem ograniczeń rynku i dostępu. Nie rozstrzyga to otwartych warunków dostępu do źródeł.

## Problem i odbiorca

Właściciel chce pozyskiwać dodatkowe oferty bez samodzielnego tworzenia wszystkich scraperów. JobSpy oferuje gotowe adaptery, ale ich wspólny wynik nie przekazuje dostatecznej informacji o jakości i ograniczeniach pobierania. Przykładowo szacunek wynagrodzenia może wyglądać jak widełki pracodawcy, a przebieg z pominiętymi rekordami lub bez opisów może wyglądać na zakończony poprawnie. Są to obserwacje kodu opisane w analizie, nie wyniki pomiarów produkcyjnych.

Bez tych informacji aplikacja mogłaby błędnie filtrować oferty, sugerować kompletność zbioru lub uznać nieobserwowane ogłoszenia za wygasłe. Z kolei zbyt rozbudowany fork utrudni przejmowanie poprawek adapterów od autorów JobSpy.

Bezpośrednim odbiorcą zmian jest integracja pobierania w naszej aplikacji oraz osoba ją utrzymująca. Końcowym użytkownikiem danych pozostaje jeden właściciel. Nie budujemy publicznego agregatora ani usługi dla innych użytkowników.

## Oczekiwane rezultaty

- Właściciel otrzymuje dodatkowe oferty ze znanym źródłem i widocznymi brakami danych.
- Rozróżnia wynagrodzenie podane przez pracodawcę, oszacowane przez portal i o nieustalonym pochodzeniu.
- Rozumie, czy odczyt ustalonego zapytania zakończono, ograniczono limitem, przerwano lub wykonano z brakami. Zakończenie zapytania nie jest obietnicą pobrania całego rynku ani wszystkich ofert portalu.
- Utrzymujący integrację potrafi ustalić przyczynę braku danych i bezpiecznie wznowić pobieranie.
- Kolejne aktualizacje JobSpy można ocenić przed wdrożeniem, a błędną wersję wycofać bez utraty już zapisanych ofert.

Dowodem użyteczności będzie kontrolowany import Indeed Polska dla zakresu PHP senior, przegląd jakości uzyskanych danych i porównanie z dotychczasowym zbiorem SOLID.Jobs. Raport z próby powinien pokazać dodatkowe oferty, duplikaty, trafność zakresu, braki opisów i płac, pochodzenie kwot oraz błędy pobierania. Nie ustalono minimalnej liczby nowych ofert, procentu kompletności ani oszczędności czasu. Te pomiary mają pomóc w decyzji o kontynuacji, a nie służyć jako nieuzgodniona obietnica.

## Zakres proponowanej pierwszej wersji

### 1. Pochodzenie i znaczenie wynagrodzenia

Wynik pozwala odróżnić kwotę pracodawcy od szacunku portalu i nieznanego pochodzenia. Zachowuje walutę, okres oraz dostępny kontekst uzasadniający klasyfikację. Gdy portal dostarcza obie wartości, integracja nie traci informacji o ich odmiennym charakterze.

Brak danych o brutto/netto, VAT lub rodzaju umowy pozostaje niewiadomą. Typ `contract` nie jest automatycznie interpretowany jako B2B. Przeliczona kwota nie zastępuje wartości źródłowej. Pierwsza wersja nie obiecuje poprawnego wyodrębniania dowolnych polskich widełek z tekstu każdego portalu.

### 2. Jakość i wynik pobierania

Dane przekazywane do aplikacji obejmują wynik odczytu dla każdego wybranego źródła i zapytania, przyczynę jego zakończenia oraz znane ograniczenia. Pusty poprawny odczyt jest odróżnialny od blokady, błędu lub nierozpoznanej odpowiedzi.

Widoczne są pominięte ogłoszenia, nieudane pobrania szczegółów i filtry, których źródło nie zastosowało. Brak opisu nie powoduje udawania pełnego rekordu. Jeśli dokładna liczba pominiętych wyników jest nieznana, wynik komunikuje tę niepewność.

Nieobecność ogłoszenia w ograniczonym wyszukiwaniu nie jest dowodem wygaśnięcia. Fork dostarcza informacje o przebiegu; decyzje o stanie zapisanej oferty pozostają po stronie aplikacji.

### 3. Dane przeznaczone do integracji

Aplikacja otrzymuje oferty i informacje o przebiegu w udokumentowanym, wersjonowanym formacie JSON. Zachowane są struktury danych, brakujące wartości, identyfikatory źródłowe i adresy ofert; listy nie są sprowadzane wyłącznie do tekstu rozdzielonego przecinkami.

Wynik wskazuje źródło, użyty zakres wyszukiwania, czas pobrania oraz wersję forka. Pozwala odtworzyć, skąd pochodzi zapisany rekord i dlaczego jego dane uznano za niepełne. Dane przetworzone przez JobSpy nie są przedstawiane jako oryginalna odpowiedź portalu. Diagnostyka nie zanieczyszcza eksportu ofert.

Konkretny schemat, sposób uruchamiania oraz mapowanie do bazy zostaną określone przed implementacją danej funkcjonalności.

### 4. Kontrolowane pobieranie i ponowienia

Można jawnie wybrać źródło, zakres zapytania i limity pracy. Pobieranie ma ograniczony czas i liczbę ponowień; nie kontynuuje bez końca po blokadzie lub zmianie formatu strony. Rozpoznane ograniczenia tempa są respektowane, a stan oczekiwania albo zatrzymania jest przekazywany do aplikacji.

Chwilowy błąd może zostać ponowiony bez ręcznego uruchamiania całego procesu. Błąd wymagający zmiany parsera nie wywołuje nieograniczonej serii identycznych żądań. Szczegółowa polityka limitów zależy od źródła i wymaga sprawdzenia przed jego uruchomieniem. Ponowne wykonanie nie może tworzyć duplikatów tej samej obserwacji w aplikacji; odpowiedzialność za zapis pozostaje w jej importerze.

### 5. Utrzymanie forka

Zmiany obejmują przede wszystkim informacje tracone przez obecny eksport, diagnostykę i kontrolę pobierania. Unikamy przebudowy adapterów niezwiązanej z tymi celami. Każdą używaną wersję da się powiązać z wersją bazową JobSpy i zestawem naszych zmian.

Aktualizacje oryginalnego projektu są oceniane przed wdrożeniem. Przykłady odpowiedzi portali pozwalają wykrywać regresje parserów bez wykonywania żądań podczas zwykłego sprawdzania zmian. Zestaw obejmuje również odpowiedzi puste, błędne i niepełne oraz oba rodzaje wynagrodzeń. Materiały testowe nie zawierają sekretów ani zbędnych danych osobowych. Same testy na zapisanych przykładach nie potwierdzają bieżącej sprawności portalu.

## Granica odpowiedzialności

| Fork JobSpy | Aplikacja ofert pracy |
| --- | --- |
| Pobieranie i odczyt informacji z portali | Harmonogram oraz zlecanie i prezentacja operacji |
| Identyfikatory i linki źródłowe | Trwały zapis, rewizje i historia |
| Pochodzenie pól, braki i ograniczenia źródła | Kwalifikacja PHP senior i komunikowanie niewiadomych |
| Wynik zapytania, błędy i kontrola żądań | Łączenie duplikatów między portalami i stan oferty |
| Wersjonowany eksport | Profil, dopasowanie, rating, research i rekrutacje |

Fork nie potrzebuje CV, prywatnego profilu ani historii rekrutacji. Dostaje jedynie parametry niezbędne do wyszukania ofert. Nie wprowadzamy zależności jego logiki od osobistych preferencji właściciela.

## Typowe przebiegi

**Nowe źródło.** Właściciel uruchamia import ustalonego zakresu z Indeed Polska. Aplikacja zapisuje obserwacje źródłowe i sprawdza kwalifikację PHP senior. Samo dopasowanie frazy wyszukiwania nie jest potwierdzeniem technologii ani seniority; brak informacji pozostaje jawny zgodnie z regułami aplikacji.

**Szacunek zamiast widełek.** Oferta zawiera kwotę oszacowaną przez portal. Informacja dociera do aplikacji razem z kwotą. Nie jest prezentowana jako deklaracja pracodawcy ani bezwarunkowo używana jako potwierdzenie spełnienia minimum finansowego. Zasady filtrowania takich wartości wymagają odrębnego doprecyzowania po stronie aplikacji.

**Częściowy odczyt.** Portal blokuje żądania po pobraniu części wyników. Pobrane rekordy pozostają dostępne, a wynik wskazuje przerwany odczyt i jego przyczynę. Aplikacja nie oznacza niewidzianych ogłoszeń jako wygasłe wyłącznie na tej podstawie.

**Brak szczegółów.** Karta oferty jest dostępna, ale pobranie opisu się nie udaje. Oferta może zostać przekazana z oznaczeniem braków; utrzymujący integrację widzi, co można ponowić. Nie jest komunikowana pełna dostępność danych.

**Aktualizacja JobSpy.** Utrzymujący sprawdza wpływ nowej wersji na używany eksport i parsery. W razie regresji pozostaje przy poprzedniej wersji lub do niej wraca. Zapisane dane aplikacji pozostają dostępne.

## Ograniczenia i wyłączenia

- Indeed odłożono na koniec. Pozostałe adaptery są podłączane osobno; obecny zakres pozostaje Senior PHP w Polsce.
- Nie obiecujemy pełnego pokrycia portalu ani rynku pracy. Praca zdalna i lokalizacja nie są równoznaczne z potwierdzoną możliwością zatrudnienia osoby z Polski.
- Zachowujemy informacje wymagane przez licencję JobSpy. Warunki dostępu do portali wymagają osobnego sprawdzenia przed próbą na żywo i regularnym użyciem; analiza repozytorium ich nie rozstrzyga.
- W tej inicjatywie nie dodajemy płatnych usług ani zakupu proxy. Potrzeba takiego wydatku wymaga osobnej decyzji właściciela; dotychczasowy budżet AI nie jest domyślną zgodą na te koszty.
- Poza zakresem: automatyczne aplikowanie, logowanie do kont portali, obsługa CAPTCHA, publiczna publikacja ofert i dodawanie polskich portali nieobecnych w oryginalnym projekcie.
- Nie rozwijamy MCP, panelu użytkownika ani własnej bazy wewnątrz forka. Nie przenosimy do niego oceniania, researchu ani zarządzania rekrutacją.
- Nie przepisujemy biblioteki na TypeScript. Wybór granicy procesu i sposobu dystrybucji pozostaje decyzją techniczną.

## Proponowane etapy

1. **Potwierdzenie wykonalności:** wybór konkretnej wersji bazowej, sprawdzenie dostępu do Indeed Polska, ustalenie sposobu utrzymania forka oraz kontrolowana próba. Wynik może uzasadnić rezygnację ze źródła przed dalszymi pracami.
2. **Pierwsza użyteczna wersja forka:** Indeed z pochodzeniem wynagrodzeń, informacjami o jakości przebiegu, wersjonowanym eksportem i kontrolą żądań. Weryfikacja również na zapisanych przykładach.
3. **Włączenie do aplikacji i ocena wartości:** zapis ofert z zachowaniem istniejących reguł historii oraz przegląd dodatkowych wyników. Adapter aplikacji jest pracą integracyjną, nie rozszerzeniem domeny forka.
4. **Ewentualny LinkedIn:** osobna ocena opłacalności, dostępu i braków danych; bez automatycznego zobowiązania do rozszerzenia na pozostałe portale.

## Niewiadome i warunki dalszych prac

| Kwestia | Co blokuje / następny krok |
| --- | --- |
| Dostęp na żywo do Indeed jako pierwszego źródła | Kierunek implementacji zaakceptowany 2026-11-02; uruchomienie nadal wymaga rozstrzygnięcia warunków dostępu. |
| Warunki i rzeczywista dostępność pobierania | Uruchomienie źródła; sprawdzić warunki i wykonać ograniczoną próbę. |
| Konto, miejsce i wersja bazowa forka | Utworzenie repozytorium i odtwarzalne wydania; ustalić przed jego założeniem. |
| Dopuszczalne tempo, czas i ponowienia | Regularne pobieranie; określić na podstawie ograniczeń źródła i próby. |
| Wystarczająca jakość i liczba dodatkowych ofert | Decyzja o dalszym utrzymaniu; ocenić wyniki próby, bez z góry wymyślonego progu. |
| Wpływ szacunków płacy na filtry aplikacji | Włączenie takich kwot do kwalifikacji finansowej; ustalić osobną regułę, zachowując pochodzenie w forku. |

Dokument określa zaakceptowany kierunek prac, nie stanowi kompletnej specyfikacji implementacyjnej. Jednemu PRD odpowiada wiele par requirements/solution-design, np. dla danych płacowych, jakości przebiegu, eksportu oraz kontroli pobierania. Dopracowujemy wybraną parę dopiero przed realizacją danej funkcjonalności.

Pierwsza wybrana para: [pochodzenie płacy — requirements](features/pochodzenie-placy/requirements.md) i [solution-design](features/pochodzenie-placy/solution-design.md). Organizacja lokalnej pracy i blokada uruchomienia źródła: [local-development](local-development.md).

Kolejne realizowane funkcjonalności: [kontrakt przebiegu — requirements](features/kontrakt-przebiegu/requirements.md), [solution-design](features/kontrakt-przebiegu/solution-design.md) oraz [kontrola żądań — requirements](features/kontrola-zadan/requirements.md), [solution-design](features/kontrola-zadan/solution-design.md).

Decyzja o kolejności z 2026-11-02: scraper HTML Indeed realizujemy na końcu. Wcześniej weryfikujemy paczkę, publikujemy zmiany forka (commit/push wyraźnie zatwierdzone osobno) i przygotowujemy [integrację aplikacji — requirements](features/integracja-aplikacji/requirements.md), [solution-design](features/integracja-aplikacji/solution-design.md). Integracja offline jest niezależna od rozstrzygnięcia dostępu live i pozostaje domyślnie wyłączona; pilot oraz zgoda na zakres danych nadal są otwarte.

Rozszerzenie zlecone przez właściciela: [pozostałe źródła — requirements](features/pozostale-zrodla/requirements.md), [solution-design](features/pozostale-zrodla/solution-design.md). Katalog obejmuje wszystkie adaptery; podłączenie techniczne nie oznacza potwierdzonego importu na żywo.

Decyzja 2026-11-02: dopuszczamy zagraniczne oferty w pełni zdalne; kraj portalu nie wyklucza pracy z Polski. [Wymagania](features/zdalne-zagraniczne/requirements.md) i [SD](features/zdalne-zagraniczne/solution-design.md) zastępują dotychczasową blokadę kraju w tym zakresie.

Aktualizacja 2026-11-02: właściciel potwierdził zgodę LinkedIn i Indeed na scraping do jednego query/s. [Kontrola żądań](features/kontrola-zadan/requirements.md#potwierdzona-zgoda-i-limit--2026-11-02) obejmuje wszystkie próby HTTP łącznie. LinkedIn przechodzi do ręcznego pilota; Indeed HTML pozostaje na końcu, a istniejący adapter GraphQL wyłączony. Wcześniejsze wzmianki o braku zgody są historyczne.

Realizowany ostatni etap: [scraper HTML Indeed — requirements](features/scraper-html-indeed/requirements.md), [SD](features/scraper-html-indeed/solution-design.md). Osobna funkcja HTML zachowuje kontrakt i nie zastępuje publicznego adaptera GraphQL w bibliotece; aplikacja wybiera HTML. Próba 2026-11-02: HTTP 403, źródło pozostaje wyłączone.
