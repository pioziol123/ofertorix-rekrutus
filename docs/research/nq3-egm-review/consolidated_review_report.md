# Przegląd EGM epiku nq3 (panel synchronizacji ogłoszeń) — raport zbiorczy

Data: 2026-11-22. Metoda: Elephant-Goldfish Model, tryb „raport zbiorczy”. Dziesięciu recenzentów bez znajomości wcześniejszych rozmów przeczytało PRD, wymagania i projekt rozwiązania (`docs/specs/nq3-panel-synchronizacji/`) oraz epik z pięcioma ticketami nq3.1–nq3.5 (eksport: `tickets-export.md`). Raporty cząstkowe leżą w `raw/`. Etapy 5, 6, 7 i 9 poszły równolegle, bo w tym trybie nic nie zmienia dokumentów między etapami; etap 8 poszedł po nich.

Czytano kopię roboczą: PRD, wymagania, projekt i makieta (`docs/prototypes/synchronizacje/`) nie są jeszcze w git (nieśledzone).

Wyniki w raportach cząstkowych: 1 bloker, 71 uwag istotnych i 105 drobnych. Wiele z nich się powtarza. Po połączeniu poniżej jest 1 bloker, 7 decyzji dla Ciebie, 8 grup uwag istotnych i jedna lista drobnych.

**Ocena ogólna.** Cel, podział na pięć zadań i kryteria są spójne i dają się zrozumieć: recenzent czytający tylko dokumenty streścił każdą sekcję, a 38 kryteriów akceptacji występuje słowo w słowo w ticketach i w projekcie. Fakty oznaczone w projekcie jako „Observed, 2026-11-22” zgadzają się z kodem. Tickety nie nadają się jednak jeszcze do przekazania agentowi: jedna grupa kryteriów jest nie do sprawdzenia w piaskownicy agenta, a siedem decyzji produktowych jest otwartych albo zapisanych jako zamknięte, choć recenzenci podważyli je niezależnie od siebie.

## 🔴 Bloker

### B1. Około 12 kryteriów interfejsu nie da się udowodnić w piaskownicy agenta wdrażającego
Co psuje się agentowi i Tobie: agent wdrażający pracuje w piaskownicy bez przeglądarki, a repozytorium nie ma biblioteki do testowania komponentów. Kryteria T1-AC05, AC06, AC07, AC10, T3-AC01, AC02, AC07, AC08, T4-AC06, AC07 i T5-AC03 każą sprawdzać „w działającej aplikacji” rzeczy takie jak najechanie myszą na dymek, fokus, Escape, wpisywanie numeru strony, okno uruchamiania, kliknięcie „i N innych” i zegar po stronie przeglądarki. Zwykłe żądanie strony ani trasy na to nie odpowie. W epikach sq2 i opn to samo sprawdzenie brzmiało „zażądaj strony lub trasy i przeczytaj odpowiedź”; w nq3 to sformułowanie wypadło. Skutek: agent albo uzna kryterium za niesprawdzalne i zwróci zadanie, albo je „zaliczy” bez dowodu.

Opcje do wyboru: (a) wydzielić czyste funkcje (formatowanie dymków, układ listy stron, reguły filtra) i sprawdzać je testami jednostkowymi; (b) dodać przeglądarkę do obrazu piaskownicy; (c) oznaczyć te kryteria jako sprawdzane przez Ciebie po scaleniu do `main`. **Decyzja należy do Ciebie.**

## Decyzje dla Ciebie (od najważniejszej)

Poniższe siedem punktów to miejsca, gdzie recenzenci niezależnie podważyli decyzje zapisane jako „(owner, 2026-11-22)” albo wykryli sprzeczność, której nie rozstrzygnie agent. Etap 8 zauważył, że w dokumentach tylko dwie z tych decyzji (PS-D01, PS-D02) mają kształt decyzji z odrzuconymi opcjami; pozostałe są zapisane w jednym zdaniu, a README makiety, na które powołuje się PRD, zapisuje tylko część i w kilku miejscach im przeczy (odświeżanie na żywo, numer próby, zakres w szczegółach, znacznik „Harmonogram”).

### D1. Skąd bierze się liczba „nowych ogłoszeń” synchronizacji (decyzja PS-D01)
Problem: przy każdej synchronizacji panel ma pokazać, ile ogłoszeń jest nowych. Projekt liczy to w chwili zakończenia synchronizacji i zapisuje przy niej. Wymaga to nowego indeksu, przeniesienia historii, zmiany obu dróg zakończenia (pracy w tle i obsługi porażki, która dziś nie jest transakcyjna) i okna, w którym liczba jest pusta. Z tego pojedynczego wyboru wynika około jednej trzeciej wszystkich uwag: zastępczy napis „— niedostępne” w T1, kolejność T1 i T2, „dodaj 0” w T4, ryzyko zablokowania źródła, gdy liczenie się nie uda, i rozmiar T1.

Recenzenci zaproponowali cztery wzajemnie niezgodne wyjścia:
1. Zostawić zapis przy zakończeniu (obecny projekt). Jedyny prawdziwy argument to zachowanie liczby po ewentualnym czyszczeniu historii (pozycja 42 zrzutu); projekt tego argumentu nie podaje.
2. Liczyć przy odczycie dla przebiegów z bieżącej strony (strony mają najwyżej 100 przebiegów).
3. Liczyć przy zapisie każdej partii, obok istniejących liczników „widziane” i „zmienione” (przez `addBatchToRunCounters`). Usuwa indeks, drugą drogę zakończenia i przeniesienie historii.
4. Wyprowadzić z daty pierwszego zobaczenia ogłoszenia (`source_ads.first_seen_at` istnieje; źródło ma jedną nieukończoną synchronizację naraz, więc ogłoszenie jest nowe w przebiegu R, gdy jego data pierwszego zobaczenia jest nie wcześniejsza niż start R). Nie wymaga indeksu, przeniesienia historii ani zmiany dróg zakończenia i odpowiada wprost na „nowe w 24 h” z PRD. Zastrzeżenia do sprawdzenia: przebiegi sprzed poprzedniego epiku mogą się różnić, i czy wszystkie stare ogłoszenia zachowały datę (recenzent twierdzi, że data jest ustawiana przy wstawieniu i nigdy nie zmieniana; tego nie sprawdzałem).

Osobno: zamiana kolejności T1 i T2 (lub ich połączenie), żeby strona nigdy nie pokazywała zastępczego „— niedostępne”. **Decyzja należy do Ciebie**, również czy pamiętałeś o tych alternatywach, gdy zatwierdzałeś PS-D01.

### D2. Co strona obiecuje o świeżości
Problem: PRD i T1-R01 mówią, że strona pokazuje synchronizacje „jak w chwili otwarcia”. Ale każda zmiana filtra lub strony odczytuje listę na nowo, a T4-R07 i T4-AC07 zamrażają pasek podsumowania. Po zakończeniu synchronizacji zmiana filtra pokaże jej wiersz jako „Pełna”, a pasek wciąż „w toku”. Dodatkowo nowa strona nie ma przycisku odświeżania ani znacznika „stan na”, więc żeby śledzić uruchomioną synchronizację, trzeba przeładować przeglądarkę (lista ofert ma „Odśwież widok”, który po T5 zniknie razem z blokiem, w którym siedzi).

### D3. Dokąd prowadzą kafelki paska
Problem: „Wymaga uwagi” liczy źródła, ale żaden ekran ich nie wylicza. Ostrzeżenie wymienia tylko źródła nieaktualne lub z trzema porażkami z rzędu, więc źródło, którego ostatnia synchronizacja jest „Niepełna”, jest policzone i nigdzie niewymienione. Kliknięcie nazwy z ostrzeżenia filtruje historię do 7 dni, co ukrywa starą pełną synchronizację, o którą ostrzeżenie chodzi. Kafelek „W toku” nie jest klikalny. Także definicja „wymaga uwagi” jest trojaka: PRD liczy synchronizacje, wymagania źródła, makieta synchronizacje z okna 7 dni; pasek ma w PRD cztery pozycje, w wymaganiach trzy plus osobne ostrzeżenie.

### D4. Do czego służy ostrzeżenie o zdrowiu źródeł
Problem: czterech recenzentów uznało, że ostrzeżenie będzie świeciło zawsze: tylko SOLID.Jobs ma harmonogram, więc źródła uruchamiane ręcznie mają od początku „nigdy” albo „nieaktualne”; polskie portale z limitem 50 ogłoszeń i LinkedIn „zawsze” kończą niepełnie. Etap 8 zauważył, że to założenie nie jest zmierzone: limit trafia dopiero 51. pasujące ogłoszenie, więc „nigdy pełna” jest przesadą; a propozycja ograniczenia reguły 3 dni do źródeł z harmonogramem zostawiłaby jedno źródło i okroiła cel 3 PRD. Brakuje rozstrzygnięcia, czy ostrzeżenie jest przypomnieniem, czy alarmem. Odsetek pełnych synchronizacji na źródło można odczytać z zapisanych przebiegów, zanim zdecydujesz. PRD nie opisuje też znanego szumu tego ostrzeżenia ani ryzyka historii, której nikt nie czyści.

### D5. Zegar listy ofert (T5-R05)
Problem: T5 usuwa z listy ofert cały zegar samoodświeżania. Zegar obsługuje także oczekującą ocenę AI (`matching.pending` w `offers.vue`), co nie ma nic wspólnego z synchronizacjami. Ani PRD, ani zakres T5, ani tytuł ticketu o tym nie mówią, a T5-R05 mówi „nigdy”, podczas gdy T5-AC03 sprawdza 30 sekund. Prostsza alternatywa: usunąć tylko gałąź dla synchronizacji polskich portali.

### D6. Gdzie żyją nazwy źródeł i powody wyłączenia
Problem: projekt przedstawia katalog źródeł z nazwami wyświetlanymi jako istniejący, a istnieje tylko jego połowa. Złącze źródła nie ma nazwy; SOLID.Jobs i Himalayas nie mają nazwy nigdzie; powody wyłączenia istnieją wyłącznie w makiecie HTML; `readSourceCatalog` obejmuje tylko JobSpy i polskie portale; projekt nie mówi, czy odczyt historii, okna uruchamiania i listy ostrzeżeń to jeden odczyt, czy trzy; nie podaje nazw, kolejności ani zachowania dla źródła, którego już nie ma w katalogu. Propozycja recenzenta: pole nazwy na złączu, jeden stały powód wyłączenia, a odczyt historii niesie „włączone, powód, id nieukończonej synchronizacji”. Zadanie nq3.5 usuwa też stare odczyty bez wskazania, co się z nimi dzieje.

### D7. Które dodatki zatwierdzone przez Ciebie zostają w MVP
Problem: recenzent kierujący się MVP uznał za ozdobniki ponad potrzebę: okienko listy stron z wpisywaniem cyfr (T1-R09, AC07) i dymek z odstępem 16 px od krawędzi (T1-R07, AC05); zwykły pager listy ofert już istnieje. Obie rzeczy są też głównym źródłem kryteriów z B1. Do odłożenia do zrzutu `oferty-pracy-sz5` z podaniem numeru i opisu pozycji, jeśli się zgodzisz.

## 🟡 Istotne (poprawki dla agenta przygotowującego, bez Twojej decyzji)

1. **Te same słowa znaczą różne rzeczy.**
   - „W toku” to stan trwającej synchronizacji, ale T4-AC01 liczy pod tą nazwą czekające i trwające razem; „W kolejce” jest osobnym stanem.
   - „Wymaga uwagi” ma w glosariuszu inne znaczenie (stan zlecenia AI).
   - „Pełna”, „complete sync”, „complete source sync”; „niepełna”, „incomplete”, „Niepełna”; „nieukończona” niesie centralną regułę T3 (jedna nieukończona synchronizacja na źródło) i nie jest nigdzie zdefiniowana (PRD l. 42, 58).
   - „Zakres” znaczy parametry wyszukiwania, jednostkę oznaczania niedostępnych i jednostkę blokady; projekt raz mówi „na źródło”, raz „na zakres”. W kodzie blokada jest per źródło (blokada doradcza i wyłączność w kolejce), a unikalne indeksy są per zakres, więc opis w projekcie jest nieścisły (a przebiegi sprzed poprzedniego epiku mogą się nakładać).
   - „Run”, „sync” i „sync run” zamiennie; brak mapy status → polska nazwa.
   - „Włączone”, „wyłączone”, „niepodłączone” nie są zdefiniowane, a źródła „niepodłączone” z makiety zniknęły bez słowa.
   - „Źródło wnioskujące niedostępność” i „polskie portale” nie są nigdzie wymienione, a bez tego nie da się napisać sprawdzeń T1 i T2; zakres T2 wyłącza to z zakresu.
   - Brakuje terminów w glosariuszu: „nowe ogłoszenie synchronizacji”, „zmienione ogłoszenie”, a „wersja treści” nie jest terminem glosariusza (T1-R06 definiuje „zmienione” jako „nowe wersje treści minus nowe ogłoszenia”, co jest mechaniką).

2. **Zapisy, które sobie przeczą.**
   - T4-R08: wyłączone źródła są „nigdy liczone ani wymieniane”, a projekt (l. 171) i T4-R01/R03 liczą ich synchronizacje w „w toku” i „nowe w 24 h”; żadne kryterium tego nie sprawdza.
   - T1-R06 mówi, że liczba nowych ogłoszeń nie bywa pusta, a projekt przy przenoszeniu historii to dopuszcza; T4 traktuje pustą jak 0; wyświetlenie nie jest opisane.
   - Data w dymku T2: T2-R04 podaje datę wdrożenia, projekt „najwcześniejszy przebieg z zapisaną wartością” i tekst zastępczy bez daty; T2-R03 i T2-R04 kolidują dla niepełnej synchronizacji sprzed zadania. Nie ma formatu daty.
   - Nieznana liczba niedostępnych: „— niedostępne” w T1-R05/AC04, ale samo „—” w T2-R03/R04/AC03/AC04; T1-AC04 staje się fałszywe po T2 bez adnotacji; widok szczegółów przed T2 nie jest opisany dla T1-R13, AC10, AC12.
   - Zakres T2 wyłącza ogłoszenia, które znów stają się dostępne, a T2-R05 ustala dla nich reguły i nie ma kryterium.
   - Przeniesienie historii: projekt (l. 83) mówi, że odbywa się przy zatrzymanej aplikacji, a l. 95–96 dopuszcza stary kod w czasie migracji i synchronizację kończącą się między migracją a nowym kodem.
   - T5 „nie dodaje ani nie zmienia żadnej operacji”, a edytuje odczyt listy ofert i usuwa trasy; projekt mówi „moduł ofert nie bierze udziału”.
   - Makieta przeczy wymaganiom (odświeżanie na żywo, numer próby, zakres w szczegółach, znacznik „Harmonogram”, „wymaga uwagi (7 dni)”, „—” przy pustym, „nowych ogłoszeń”), a PRD nie mówi, co wygrywa.
   - PRD: „każde źródło przeszukuje jeden stały zakres” jest szersze niż T3-R03, które obejmuje tylko synchronizacje zlecane z panelu. Stały zakres panelu to w istocie istniejące wartości domyślne złączy.

3. **Luki, które zatrzymają agenta wdrażającego.**
   - Brak kontraktu pięciu nowych tras HTTP: kształtów, statusów, kodu „nie znaleziono”, odrzucenia pustej listy, limitu liczby identyfikatorów; nie wiadomo, czy trasy idą przez wspólną obsługę z kontrolą Origin, czy ręcznie jak `polish.post.ts` (Origin, typ treści, rozmiar, `no-store`).
   - T3: nie wiadomo, jak przekazać stały zakres polskich źródeł (parser rzuca błąd bez `{ source }`); błędy inne niż odmowa kolejki, w tym błąd nieprawidłowych ustawień z `requestSync`, nie mają opisanego skutku; T3-AC06 nie ma punktu wstrzyknięcia „odmowa dla dokładnie jednego z trzech”; kryterium dla jednego źródła da „1 źródeł” (brak form liczby mnogiej).
   - Testy: `tests/sync-run.fixtures.ts` ma sztywną listę migracji, z której buduje schemat ok. 10 testów integracyjnych modułu źródeł; bez nowych migracji T1/T2 te testy się wywrócą; test „przeniesienie równa się stanowi końcowemu” wymaga dwuetapowego przygotowania, którego projekt nie opisuje.
   - Dokumentacja po T5 jest niedoszacowana: główny `README.md` (l. 130, 148, 174) opisuje usuwany formularz i przyciski, `docs/architecture/README.md` (l. 95, 122) linkuje do trzech usuwanych plików tras, `docs/specs/jobspy/local-development.md` i README modułu źródeł też; projekt wspomina tylko README modułu. Cztery strony mają własne, skopiowane menu, o czym projekt nie mówi.
   - Usuwane trasy odczytu stanu nie mają wymagania ani kryterium, a README makiety opisuje je jako punkty dla operatora.
   - Strefa czasowa „dziś” i grup dni: projekt mówi „lokalna północ” serwera, konwencja projektu to Europe/Warsaw (jedyny precedens: dzień harmonogramu; `compose.yaml` nie ustawia TZ), a nagłówki dni budowane są w przeglądarce. Nie wiadomo, czy „ostatnie 7 dni” to dni kalendarzowe czy okno przesuwane, ani po którym czasie (zlecenia czy zakończenia) filtruje okres. „Ostatnia zakończona” w T4 nie ma klucza uporządkowania, a istniejący indeks kolejności przebiegów jest per zakres, nie per źródło.
   - T4: brak tekstu przyczyny „3 nieudane z rzędu”, kolejności nazw; T4 powinno użyć istniejących zapytań `findLatestRunRecord` i `findLatestCompleteRun`.
   - Teksty dymków poza „Pełna” (T1-R07, T1-AC05) są tylko w `docs/prototypes/synchronizacje/index.html`, który nie jest w git; agent w czystym worktree ich nie zobaczy.
   - Tryb uruchomienia z wiersza poleceń: trzy sposoby startu, dwie wartości „kto uruchomił” (odpowiedź jest w `requestSync`, domyślnie ręczne; tylko projekt l. 177 czyta się dziwnie).
   - Po „Uruchom ponownie” nie wiadomo, czy lista i pasek się odświeżają; filtr „po potwierdzeniu” nie mówi, co dzieje się z pozostałymi filtrami; kliknięcie nazwy lub potwierdzone zlecenie ma nieopisane skutki dla innych filtrów.
   - Okno uruchamiania: brak tekstów i reguły „powodu wyłączenia”; widok szczegółów nie ma znacznika „włączone”, więc „Uruchom ponownie” nie ma skąd go wziąć.

4. **Synchronizacja, której liczenie ciągle zawodzi.** Jeśli liczenie nowych ogłoszeń nie uda się na żadnej z dwóch dróg zakończenia, synchronizacja zostaje nieukończona i blokuje swoje źródło, a projekt nie mówi, jak to się kończy. (Zniknie przy wyborze D1, opcje 3 lub 4.) Uwaga: pierwotnie recenzent uznał, że zawieszona synchronizacja blokuje źródło na stałe, bo nie ma anulowania. Etap 8 uznał to za przesadzone: kolejka `source-sync-run` ma 3 próby i limit 3600 s (`queues.json`, sprawdziłem), a obsługa porażki kończy przebieg martwego workera; pozostaje tylko przebieg w kolejce przy zatrzymanym workerze. PRD i tak nie nazywa tego ryzyka.

5. **PRD nie ma sekcji ryzyk i alternatyw** (jest w PRD sq2). Niezapisane: seria zapytań do zewnętrznych portali z „Synchronizuj wszystkie”, to, kto z przeglądarki może to wywołać, rosnąca historia bez czyszczenia, stała flaga źródeł, które nie dojdą do pełnej synchronizacji, brak licznika niedostępnych przed T2. PRD nie wskazuje też alternatyw zapisanych w projekcie, a jego etapy nie mają linków ani numerów zadań.

6. **Zależności i struktura wymagań.** Wymagania nie mają „Depends on” (rzeczywiste krawędzie: T2←T1, T3←T1, T4←T1 i T3, T5←T3), a T5 usuwa jedyną drogę z przeglądarki do polskich portali, więc musi czekać na T3. Nq3.5 nie zależy od nq3.4, więc właściciel traci informację o niepełnym imporcie, zanim powstanie pasek zdrowia. Kryteria nie wskazują wymagań, które sprawdzają. Brak pokrycia: T2-R05 (żadnego kryterium), T1-R03 (powtarzany nagłówek dnia), T1-R11, T1-R17 (nieczytelny sposób uruchomienia, okres, strona poniżej 1) pokryte częściowo lub wcale, T1-R08, T1-R09, T4-R08 częściowo; T3-R10 i T5-R07 się dublują; T1-AC02 kontra domyślne 7 dni; pozycja 36 zrzutu, którą cytuje T4, i numer zadania `oferty-pracy-sz5` nie ma w liście poza zakresem PRD ani w wymaganiach.

7. **Zakres i rozmiar zadań.** T1 jest ciężkie jak na jedno zadanie bez nadzoru i blokuje pozostałe cztery; podział na część danych i część strony (albo scalenie T1 z T2, patrz D1). Ostrzeżenie: wymiana kolejności lub scalenie wpływa na wszystkie zależności.

8. **Epik i tickety w bd.** W eksporcie epiku nie widać kluczy `load_bearing` i `shared`, więc kryteria PS-AC01 i PS-AC02 powtórzone w pięciu ticketach liczą się jako kryteria poszczególnych zadań; kandydaci do `load_bearing`: T1-R06, T3-R04, T2-R06. Nq3.3–nq3.5 wskazują w polu `Spec:` PRD zamiast wymagań, a nq3.1–nq3.2 mają inny nagłówek niż nq3.3–nq3.5. Wskazanie architektury w kryteriach ticketów ma złą ścieżkę (`/architecture/moduly-i-zasady-kodu.md`, powinno być `docs/architecture/moduly-i-zasady-kodu.md`), kryterium PS-AC02 w ticketach nie rozwiązuje się do wymagania, a opis nq3.1 powiela decyzję projektu. Kolumna „Check” i wyjaśnienie zależności w ticketach są pominięte.

## 🟢 Drobne (do jednego sprzątania przed przekazaniem)
- Czyszczenie tekstu: „job” zamiast „queue job”; przeciążona komórka i niezgodne kolumny w tabeli projektu (l. 82); komórki „ta sama odpowiedź” jako szablon; „kilka ostatnich przebiegów” a T4 mówi „trzy”; „obecne limity” polskich portali; niezdefiniowane „jednokierunkowe żądanie”, „JobSpy”, „SOLID.Jobs”, „Observed”; PS-D01 bez liczb; niespójne formatowanie nazw pól; `pages` koliduje ze „stroną” pagera; angielsko-polskie niespójności (found/seen, new/changed, refused/not found, 3 dni/72 godziny).
- Zdarzenia brzegowe bez opisu: puste zaznaczenie filtra; szczegóły dla przebiegu w kolejce lub trwającego i dla pustej liczby; starsze synchronizacje mogły mieć inne zakresy, a historia tego nie pokazuje; zapisane diagnostyki pokazywane „jak zapisano” bez sekretów, escapowania i limitu rozmiaru; zdanie o ponowieniu pojawia się w komunikacie błędu także tam, gdzie ponowienie nie istnieje; dwa przyciski otwierają to samo okno; moduł `polishEnabled` i eksport widoku `PolishSource` zostają martwe po T5; „Odśwież widok” siedzi w bloku, który T5 usuwa; zapisane odrzucone opcje tylko dla PS-D01 i PS-D02; brak wiersza dla tras i odczytu okna w tabelach „sytuacji”; przebieg źródła, którego już nie ma w rejestrze, nie ma nazwy.
- PRD l. 58 zawiera mechanikę modułów; drobne szczegóły UI MVP (lista stron z cyframi, odstęp 16 px) w T1 (patrz D7).
- Filtr „po wyzwalaczu” w panelu, choć wiersze wyzwalacza nie pokazują.
- Decyzje z 22 listopada nie mają powiązanego zapisu; teksty dymków zależą od katalogu makiety (nieśledzonego w git); twierdzenia o obecnym zachowaniu aplikacji bez wskazanych źródeł.
- Recenzenci niczego nie zmienili: poza tym raportem i katalogiem `raw/` `git status` pokazuje tylko to, co było przed przeglądem.

## Zastrzeżenia do samego przeglądu
- Recenzent stylu z etapu 9 nie czytał PRD ani wymagań, więc jego uwagi M2, M3 i M6 mogły się zmienić; po połączeniu z raportami etapu 7 stylu zostały uwzględnione tylko tam, gdzie potwierdzają je inne raporty.
- Przesadzone (według etapu 8, sprawdzone): zawieszona synchronizacja (patrz punkt 4 wyżej); uwagi o poziomie szczegółowości (skrypt `check-spec-altitude.ts` przechodzi na wszystkich trzech dokumentach); „makieta nieśledzona” dotyczy też trzech dokumentów specyfikacji, a `check-spec-sync` wymusi to przy przekazaniu.
- Recenzenci nie zmierzyli odsetka pełnych synchronizacji na źródło (D4) ani poprawności `first_seen_at` dla starych ogłoszeń (D1, opcja 4).

## Mapa pochodzenia
| Punkt | Raporty |
| --- | --- |
| B1 | stage9-implementation-readiness B1 |
| D1 | stage5-zoom-out M1, stage5-inventive-catalyst M1/M6, stage8 M2 i wzorzec o PS-D01, stage6 M5/M11, stage9-implementation-readiness N2, stage9-codebase-details N1 |
| D2 | stage8 M1, stage7-design M4, stage5-inventive-catalyst nit |
| D3 | stage8 M4, stage5-inventive-catalyst M7, stage7-style M1, stage7-structural nity |
| D4 | stage7-design M3, stage5-inventive-catalyst M3, stage5-zoom-out nit, stage8 M5 |
| D5 | stage5-zoom-out M5, stage5-inventive-catalyst M2, stage7-design M5, stage7-structural M2, stage7-style M5 |
| D6 | stage5-zoom-out M2, stage5-inventive-catalyst M4, stage9-implementation-readiness M1/M2, stage9-codebase-details M3, stage7-design M9 |
| D7 | stage5-inventive-catalyst M5, stage8 uwagi o dodatkach |
| 1 | stage9-style M1–M3, stage7-style M1/M2/M4, stage6 M1/M2/M6/M7, stage7-design M9, stage9-codebase-details M5, stage7-structural M4 |
| 2 | stage6 M3/M5/M10, stage5-zoom-out M3/M4, stage7-structural M7, stage7-style M3/M7, stage9-style M4–M6, stage9-codebase-details N7 |
| 3 | stage9-implementation-readiness M3–M7, stage9-codebase-details M1/M2/M4/M6, stage7-structural M6, stage7-design M8/M10, stage6 M4/M8/M9, stage5-zoom-out nity |
| 4 | stage6 M11, stage7-design M2, stage8 (korekta) |
| 5 | stage7-design M1, stage7-structural M1 |
| 6 | stage7-structural M3/M5, stage7-design M6, stage5-zoom-out nity |
| 7 | stage9-implementation-readiness N9 |
| 8 | stage9-implementation-readiness N8, stage9-codebase-details N9, stage9-style nity, stage8 nity |
