# Skonsolidowany przegląd EGM: epik oferty-pracy-lq3 (Lista aplikacji)

**Data:** 2026-11-26. **Metoda:** EGM (Elephant-Goldfish Model), tryb skonsolidowany, wszystkie etapy 5-9 bez zatrzymań; 9 recenzentów w pierwszej fali plus etap 8 (zoom-out nad sześcioma wcześniejszymi raportami).
**Przeczytano:** `PRD.md`, `requirements.md`, `solution-design.md` z `docs/specs/lq3-lista-aplikacji/`, eksport zadań (`tickets-export.md`: epik i zadania lq3.1, lq3.2, lq3.3), słownik, reguły architektury, `implementation-workflow.md`, specyfikacje nq3 i pierwsza-wersja/rekrutacje, kod repozytorium (recenzent kodu).
**Dokumenty niezatwierdzone w gicie:** tak. W trakcie przeglądu `requirements.md` zyskał (poza przeglądem, bez udziału recenzentów) wiersz T2-R13 i kryterium T2-AC11 (układ Moja lista wg makiety `docs/prototypes/moja-lista`). Recenzenci mogli czytać wersję przed lub po tej zmianie; T2-R13 nie był świadomie oceniany.
**Liczby w raportach źródłowych (blokery / poważne / drobne):** etap 5 zoom-out 0/3/7; etap 5 katalizator 0/5/4; etap 6 0/5/10; etap 7 design 0/7/7; structural 0/4/9; style 0/5/16; etap 8 0/4/5; etap 9 gotowość 0/8/7; kod 0/3/6; style 0/5/8.

## Ocena ogólna

Dokumenty są spójne i szczegółowe, a kod repozytorium nie przeczy żadnemu sprawdzalnemu twierdzeniu projektu. **Żaden recenzent nie znalazł blokera.** Zadanie lq3.1 można przekazać runnerowi po drobnych poprawkach. Zadania lq3.2 i lq3.3 **nie powinny** iść do runnera, dopóki właściciel nie rozstrzygnie, kto buduje wspólne elementy stronicowania i wyboru wielu wartości (zależność od niedokończonego oferty-pracy-nq3.1). Dodatkowo kilka luk w zachowaniu (co po przeniesieniu wiersza poza widok, brakujące etykiety) powinno trafić do dokumentów przed przekazaniem.

## 🔴 Blokery

Brak.

## Decyzje właściciela

1. **Wspólne stronicowanie i lista wielokrotnego wyboru: kto je buduje.** Problem dla właściciela: zadania „Moja lista" (lq3.2) i filtr etapu (lq3.3) mają użyć elementów ze strony Synchronizacje, której zadanie nq3.1 jeszcze trwa. Runner dostaje je oznaczone `ready-for-agent`, a nikt nie jest wskazany do wydzielenia elementów, więc runner albo przebuduje cudzą stronę, albo skopiuje kod. Opcje: (a) dopisać do kryteriów nq3.1, że elementy są wspólne, z kontraktem; konsekwencja: lq3.2/3 czekają na nq3.1; (b) osobne zadanie wstępne; konsekwencja: dodatkowe zadanie, tez czekanie; (c) MVP z listą bez wyboru rozmiaru i bez listy numerów stron oraz zwykłym wielokrotnym wyborem w filtrze; konsekwencja: odpadają T2-R05/R08, D8, część T2-AC05 i T2-AC07, lq3.2/3 mogą ruszyć od razu, ale stronicowanie będzie później do wymiany. Rekomendacja recenzentów (etap 8): (c) jako najtańsza, w każdym wariancie dopisać zależność do Ryzyk PRD. **Decyzja należy do Ciebie.**
2. **Czy po przeniesieniu wiersza poza bieżący widok szuflada zostaje.** Gdy w widoku „Aktywne" zmienisz etap na „Odrzucone" albo „Zdjęta z listy", wiersz znika, a T2-R10 mówi, że wiersz pokazuje nowy etap. Opcje: szuflada zostaje otwarta na przeniesionej aplikacji, a lista się odświeża z korektą strony (propozycja recenzentów) albo szuflada się zamyka. **Decyzja należy do Ciebie.**
3. **Jedna etykieta na stan „brak aplikacji".** „Poza listą" (T1-R01) i „Bez aplikacji" (T3-R03) oznaczają to samo, a „Zdjęta z listy" w filtrze jest „Zdjęte z listy". Opcje: jedno słowo dla każdego stanu, trzymane w module Rekrutacje (decyzja D10). Trzeba wybrać słowo. **Decyzja należy do Ciebie.**
4. **Zachować czy uprościć gałąź „oferta zniknęła" i pośredniczenie Ofert (D5, D7).** Etap 8 sprawdził, że kod nigdzie nie usuwa ogłoszeń (są tylko oznaczane jako niedostępne), więc gałąź z SD l.66 jest dziś martwa, a „ta sama transakcja" z D5 niczego nie chroni. Opcje: (a) usunąć gałąź i nie dopisywać wymagania; (b) zostawić D5, ale z prawdziwym uzasadnieniem. Ryzyko: po scaleniu ofert (ryzyko z PRD) gałąź wróci. **Decyzja należy do Ciebie.**
5. **Czwarty etap „Zdjęta z listy" i jedyna zabroniona para.** Etap katalizatora: usunąć czwarty etap (trzy wolne etapy). Etap 8 pokazuje, że to jedyne cofnięcie pierwszego zapisu (z „brak aplikacji" nie da się wrócić, a aplikacji się nie usuwa), więc propozycja katalizatora gubi tę funkcję. Do potwierdzenia: czy cofnięcie błędnego zapisu ma być osobnym etapem, a PRD ma to powiedzieć. **Decyzja należy do Ciebie.**
6. **Czy „Moja lista" ma być osobną stroną** (propozycja katalizatora: preset filtru listy ofert z notatką w szczegółach oferty). Koliduje z Twoimi decyzjami A-R12 i całym T2; recenzent etapu 8 traktuje to jako pytanie do właściciela, nie wadę. **Decyzja należy do Ciebie.**
7. **Blokada optymistyczna (A-R07/A-R13) przy jednym użytkowniku.** Katalizator proponuje ostatni wygrywa; etap 8 odrzuca to jako sprzeczne z regułą architektury (komenda opiera się na stanie odczytanym wcześniej). Zostaje jako rozpatrzone i odrzucone, chyba że świadomie zmienisz regułę. **Decyzja należy do Ciebie.**
8. **Notatka: ostatni zapis wygrywa (A-R09/A-R11) bez uzasadnienia wymaganego regułami.** Wystarczy jedno zdanie uzasadnienia w dokumentach (jeśli to Twoja świadoma decyzja) albo zmiana. **Decyzja należy do Ciebie.**

## 🟡 Ustalenia poważne (wg tematu)

### A. Zależność od nq3.1 i wspólne elementy
- **A1.** (D8, D9, T2-R05, T2-R08, T2-AC07, T3-R03, lq3.2, lq3.3). Element wielokrotnego wyboru nie istnieje w `main`; zadania .2/.3 są `ready-for-agent`, a nq3.1 w toku; w Ryzykach PRD zależności nie ma; T3 nie ma kryterium wydzielenia elementu. Scenariusz: runner lq3.3 wchodzi w kod nieistniejącego elementu i przepisuje stronę Synchronizacje w trakcie pracy nq3.1 (kolizja zmian, także w `AppHeader`). Rekomendacja: decyzja 1, dopisać zależność do PRD. Źródła: stage5-zoom M3, stage5-inventive M5, stage7-design M3, stage9-ready M2, stage9-kod M3, stage8 M3.
- **A2.** (T2-AC07 „Przegląd zmiany", T2-R08, T3-AC05 liczba zapytań, A-AC04 „nowa pula połączeń"). Kryteria nietestowalne lub sięgające mechaniki i funkcji; wymagania nie powinny nazywać funkcji (structural M1, design M5, style M4/M5). T3-AC05 nie ma reguły, na której się opiera. Rekomendacja: przenieść mechanikę do SD, T3-AC05 oprzeć na regule lub usunąć.

### B. Luki zachowania, które zatrzymają implementatora
- **B1.** Szuflada i lista po ruchu poza widok (T2-R10, T2-R12, T2-R03, T2-R06). Źródła: stage5-zoom M2, stage6 #3, stage7-design M2, stage8. Rekomendacja: decyzja 2 plus kryterium.
- **B2.** Aplikacja, której oferta nie istnieje w odczycie Ofert (SD l.58, l.66; T2-R02, T2-R09) i znak „Niedostępna w źródle" (czy obejmuje wygasłe). Stage7-design M1, stage9-ready M6, stage6 nit. Zweryfikowane: w kodzie nie ma usuwania ogłoszeń (grep nie znalazł `DELETE FROM` ofert/ogłoszeń; stage8 wskazał jedynie usuwanie powiązań firmowych), więc to dziś martwy kod. Rekomendacja: decyzja 4; doprecyzować tylko znak niedostępności.
- **B3.** Ruch z `expected` równym `target` (SD l.47 vs A-R13, A-AC08). Trzy raporty (zoom M1, stage6 #4, ready M4) oceniły jako poważne; etap 8 sprawdził, że prawdziwe ponowienie ma przestarzałe `expected` różne od celu, więc to tylko brak przepisu na test. **Obniżone do drobnego** (patrz Zastrzeżenia). Rekomendacja: jedno zdanie w A-AC08.
- **B4.** Trzy elementy pracy bez zadania ani kryterium: migracja, rejestracja modułu z wierszem w mapie i README, przeniesienie etykiety widełek do widoku Ofert (stage6 #5, ready M1, zoom nit, kod M1). Plus brak listy plików i ścieżek tras HTTP (kod M1, ready M3). Scenariusz: runner lq3.1 nie wie, co ma utworzyć, a operacja „szczegóły aplikacji" ma klientów w T1 i T2. Rekomendacja: przypisać do zadań i dodać kryteria.
- **B5.** Filtr etapu nie przejdzie przez obecny potok filtrów (kod M2, ready M8): `parseFilters` rzuca na klucz nie będący łańcuchem, `offerFilterQuery` nie niesie wielu wartości, `offers.vue` ma stałą listę kluczy. T3-AC04 nie przejdzie bez zmiany wszystkich trzech; SD nie wymienia miejsc ani wyjątku „nieznana wartość etapu jest pomijana, nie błąd" (T3-R05). Rekomendacja: dopisać do SD.
- **B6.** Komunikaty A-R07 i A-R10 zawierają „ł", „ś", „—"; w `statusMessage` jest to ryzyko (ready M3). Etap 8 potwierdził, że istniejące `statusMessage` są ASCII, ale nie zweryfikował zachowania h3 (brak zainstalowanego pakietu). Rekomendacja: wskazać jednego właściciela tekstu i sposób przekazu (np. `data.message`), implementator weryfikuje.
- **B7.** Moment zmiany etapu z `now()` bazy a reguły czasu polskiego (ready M5): odstępstwo od reguł 2 i 4 niezapisane jako decyzja, brak przepisu na test równych momentów (kolejność wierszy o równym momencie w ogóle nie jest określona, structural N9, style). Rekomendacja: zapisać odstępstwo lub użyć biblioteki czasu; określić kolejność przy remisie.
- **B8.** Testy współbieżności nie są na liście weryfikacji, choć A-R07 jest `load_bearing` (ready M7): dwa równoległe utworzenia, dwa ruchy do różnych celów, ruch równolegle z zapisem notatki.
- **B9.** Cofnięcie ruchu zmienia pokazaną datę etapu i kolejność listy (stage8 N3) — nigdzie niezapisane; jedno zdanie w T2-R02/T2-AC04.

### C. PRD a wymagania
- **C1.** PRD obiecuje ikonkę przy każdej ofercie z aplikacją i Moja lista z każdą aplikacją, a T3-R01 i T2-R03 wyłączają „Zdjęta z listy"; „Wszystkie" nie obejmuje zdjętych (design M4, design N1). Rekomendacja: poprawić PRD; dopisać powód czwartego etapu i poprawić zdanie o cofaniu (decyzja 5, stage8 M4).
- **C2.** Klucz „jedna aplikacja na ofertę" opiera się na ID ogłoszenia; ryzyko PRD nie nazywa kolizji przy późniejszym grupowaniu ogłoszeń w ofertę przy UNIQUE i niekasowanej historii (design M6; słownik mówi „może być nowa aplikacja" wbrew `offer_id UNIQUE`, kod nit).

### D. Pojęcia o wielu znaczeniach (styl i zrozumiałość)
- **D1.** „Aplikacja" jako zgłoszenie i jako program (style M1); „Stages" w PRD jako zadania i jako etapy (style M3); „stage choice" dla filtra i pola (style M1); „list" jako Moja lista i katalog ofert; „offer" vs „ad"; „moment/date/chwila" (style9 M1-M4). Rekomendacja: zdefiniować w słowniku „moment etapu" (przechowywany) i „data etapu" (pokazywana), nazwać operacje inaczej niż strony (style9 M2).
- **D2.** Terminy projektowe użyte bez definicji: „view entry", „browser-safe view entry", „Polish time library", „Observed in the Offers module", „shared transaction mechanism" (stage6 #2, #1).
- **D3.** Twierdzenia bez źródła: „co najwyżej 10 000 ogłoszeń (Observed…)" (według recenzenta kodu limit żyje w odczycie Źródeł, nie w Ofertach), „aplikacji jest znacznie mniej niż ofert", „aktualizacja warunkowa nie wymaga blokady wiersza", kontrakty „uzgodnione" i „ilustracyjne" jednocześnie (style9 M5).
- **D4.** Kryteria obiecują więcej niż sprawdzają: „bez przeładowania strony" (T1-R02, T2-R10) sprawdzane testem trasy; T1-AC01 nie sprawdza „bez historii i daty etapu" (style M4).

### E. Struktura dokumentów
- **E1.** Wymagania wskazują funkcje i szczegóły techniczne (A-AC06, T3-AC01, „pula połączeń") — wysokość nieadekwatna (structural M1).
- **E2.** Wymagania bez kryterium (T2-R09, T2-R02, T2-R10, A-R06, A-R08, T3-R04) i kryterium bez wymagania (T3-AC05) (structural M2).
- **E3.** Cienkie pokrycie alternatyw i ryzyk w PRD/wymaganiach, brak wspólnego kryterium bramki jakości jak w sq2 (structural M3, M4).

## 🟢 Ustalenia drobne

- Pseudo-SQL w SD, indeks `(stage, stage_changed_at DESC, id DESC)` i odczyt całej historii w szczegółach oferty (zoom N1-N3, design N6, stage8 N5): jedna decyzja — rozdzielić odczyt etapu od szczegółów, indeks po pomiarze.
- Znaki a punkty kodowe w limicie notatki (A-R09 vs SD) (zoom, design N3, stage6).
- Zdanie o „ostatniej kolumnie" we wspólnych kryteriach niezgodne z tabelą; numeracja kryteriów poza kolejnością; A-AC04 obejmuje T1 i T2 (structural N1, style N2, design N2).
- „Wszystkie" wyklucza jeden etap; „Aktywne"/„Wszystkie"; „Zdjęte"/„Zdjęta".
- Test północy a `now()` bazy (design N4); argument D7 („cykl odczytów") słaby (design N5); słaby powód odrzucenia w D5 (zoom N4).
- Nagłówki zadań inne niż w sq2, brak „Zależy od nq3.1" w T2/T3 (structural N2-N3); PRD powtarza szczegóły wymagań; link do szczegółów aplikacji opisany w PRD jako etap 1, a jest T2 (N6-N7).
- „Open questions: None" bez śladu zatwierdzenia punktów niewypowiedzianych (structural N9).
- Słownik bez „Moja lista", notatki i historii etapów (structural N8).
- „Odrzucone → CV wysłane" nakłada się na pojęcie „nowa próba" ze słownika (design N7).
- Szuflada jako część strony listy bez opisu pobierania danych; `AppHeader` ma zamkniętą unię `current`, a nq3.1 edytuje te same linie; widełki są listą wariantów, a `salaryLabel` zależy od `periodLabel`; „obsługa modułu" to faktycznie `server/utils/companies.ts` (kod nit).
- Brak w liście wdrożenia: README Ofert, `docs/architecture/README.md`, słownik (kod nit).
- Testy A-AC04 (restart) i T1-AC02 (siedmiokrokowa sekwencja) sprawdzają platformę, nie funkcję (katalizator nit); klucz po ID ogłoszenia bez klucza obcego (katalizator nit).
- Powtarzalne komórki w tabeli sytuacji, nieformalne sformułowania, „widełki"/„salary range"/„salary" (style9 nits); style N1-N16 (m.in. „at a glance", „unless marked otherwise" bez odnośnika, „later save").
- Stage6 nity: brak ścieżki wiersza/szuflady dla brakującej oferty, „dwie strony" w A-R11, stronicowanie i filtry zdefiniowane tylko linkiem do nq3, przycięte teksty kryteriów w zadaniach.

## Zastrzeżenia

- **Nieprzeczytane/niezmierzone:** stage6 celowo nie czytał słownika ani kodu; recenzent etapu 8 nie mógł sprawdzić obsługi nie-ASCII w `statusMessage` (brak zainstalowanego h3); nikt nie zmierzył wolumenów (10 000 ogłoszeń, liczba aplikacji) ani wydajności zapytań.
- **T2-R13 / T2-AC11** dopisane w trakcie przeglądu poza recenzentami; nie były oceniane i wymagają osobnego sprawdzenia (wymaga to m.in. spójności z „Zdjęta z listy" w T3-R01 i z licznikiem znaków a limitem 10 000 vs punkty kodowe).
- **Ustalenia ocenione przez etap 8 jako przesadzone, sprawdzone:** ruch `expected = target` (zoom M1, stage6 #4, ready M4) — przyjęto ocenę etapu 8 po lekturze A-R13/SD l.47: ponowienie niesie przestarzałe `expected` różne od celu, więc pary tożsamej nie przedstawia; obniżone do drobnego. Katalizator M4 (porzucić `expected`) — sprzeczny z regułą architektury, odrzucony. Katalizator M1 twierdzi, że „Odrzucone" daje ten sam efekt co „Zdjęta z listy" — fałsz (zostaje w „Wszystkie", oznacza odmowę). Design M1/stage6 #6/ready M6 (wymóg dla brakującej oferty) — dziś nie występuje (potwierdzone grepem: brak usuwania ogłoszeń). Design M7 (uzasadnienie „ostatni zapis wygrywa") — formalnie zasadne, ale jedno zdanie, nie poważne dla MVP. Katalizator M2 — pytanie do właściciela, nie wada.
- **Różnice w ważności między raportami:** design uznał 7 poważnych, zoom-out 3; część poważnych to ten sam problem zgłoszony wielokrotnie (stage8: ok. 80 ustaleń to ok. tuzin odrębnych problemów).
- Żaden plik projektu poza `docs/research/lq3-egm-review/` nie został zmieniony przez recenzentów; `git status` pokazuje poza tym `requirements.md` (zmiana T2-R13/AC11, niezwiązana z przeglądem) i nieśledzony `docs/prototypes/moja-lista/`.

## Mapa pochodzenia

| Punkt | Raport(y) i ustalenia |
| --- | --- |
| Decyzja 1 / A1 | stage5-zoom M3; stage5-inventive M5; stage7-design M3; stage9-ready M2; stage9-kod M3; stage8 M3 |
| Decyzja 2 / B1 | stage5-zoom M2; stage6 #3; stage7-design M2; stage7-style N16; stage8 owner decision 5 |
| Decyzja 3 | stage7-style M2; stage6 #9; stage7-structural N4; stage8 M2 |
| Decyzja 4 / B2 | stage5-inventive M3; stage7-design M1, N5; stage6 #6; stage9-ready M6; stage8 M1 |
| Decyzja 5 / C1 | stage5-inventive M1; stage7-design M4; stage8 M4 |
| Decyzja 6 | stage5-inventive M2; stage8 tabela |
| Decyzja 7 | stage5-inventive M4; stage8 N2 |
| Decyzja 8 | stage7-design M7 |
| A2 / E1 | stage7-design M5; stage7-structural M1; stage7-style M4, M5 |
| B3 | stage5-zoom M1; stage6 #4; stage9-ready M4; stage8 N1 |
| B4 | stage6 #5; stage9-ready M1; stage9-kod M1 |
| B5 | stage9-kod M2; stage9-ready M8 |
| B6 | stage9-ready M3; stage8 N4 |
| B7 | stage9-ready M5; stage7-design N4 |
| B8 | stage9-ready M7 |
| B9 | stage8 N3 |
| C2 | stage7-design M6; stage9-kod nit (słownik) |
| D1-D4 | stage9-style M1-M5; stage7-style M1, M3, M4; stage6 #1, #2 |
| E2-E3 | stage7-structural M2-M4 |
| Drobne | stage5-zoom N1-N7; stage5-inventive nity; stage6 nity; stage7-design N1-N7; stage7-structural N1-N9; stage7-style N1-N16; stage8 N5; stage9-ready nity; stage9-kod nity; stage9-style nity |
