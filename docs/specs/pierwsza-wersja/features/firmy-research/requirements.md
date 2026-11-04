# Firmy, research i przygotowanie do rozmowy — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-15, R-16, R-17, R-18, R-19 i odpowiadających im AC. Powiązania: [dopasowanie](../dopasowanie/requirements.md), [oferty](../oferty/requirements.md), [operacje](../operacje/requirements.md), [rekrutacje](../rekrutacje/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-15 — tożsamość i role organizacji

Firma publikująca, zatrudniająca i klient to osobne role. Osobne podmioty mogą mieć wspólną markę/grupę. Wspólna nazwa lub domena nie wystarczają do scalenia; przy znanej tylko marce nie zgadujemy spółki.

**AC-15:** dla agencji z nieujawnionym klientem ekran pokazuje nieznanego klienta i nie przypisuje technologii projektu agencji. Dwie spółki zachowują oddzielne profile i research mimo wspólnej domeny. Niepotwierdzona identyfikacja jest jawna; nie wykorzystuje po cichu raportu innej spółki. Gdy znana jest tylko marka lub agencja, research dostępnego podmiotu nie jest blokowany: raport jasno wskazuje, kogo dotyczy, a role pracodawcy i klienta mogą pozostać nieustalone. Nie przedstawia informacji o agencji jako informacji o nieznanym kliencie ani marki jako potwierdzonej spółki.

### R-16 — podstawowy research

Automatyczne zlecenie wymaga konfigurowalnego progu ratingu i kompletności oraz braku potwierdzonej sprzeczności z wymaganiami koniecznymi. Raport należy do profilu firmy. Istniejący raport wykorzystywany jest ponownie bez TTL i automatycznego ponawiania przy kolejnej ofercie.

**AC-16:** pierwsza kwalifikująca się oferta zleca research, następna tej samej ustalonej firmy wykorzystuje raport, również po upływie długiego czasu. Dwa równoczesne zlecenia nie tworzą dwóch automatycznych badań. Oferta poniżej progu pozostaje dostępna i pozwala na ręczny research. Progi zostaną wybrane po próbce, nie zakłada się obecnie konkretnych wartości.

### R-17 — research na żądanie i wersje

Oba etapy można uruchomić ręcznie; pogłębiony jest wyłącznie na żądanie. Nowy raport staje się aktualny dla etapu, poprzednie są dostępne. Automatyczne ponawianie ukończonego researchu nie występuje. Przygotowanie ma dodatkowo powiązanie z ofertą/aplikacją i znanym projektem.

**AC-17:** ręczne odświeżenie podstawowego nie usuwa pogłębionego ani dawnych wersji; błąd odświeżenia pozostawia poprzedni ukończony raport. Nowa oferta nie uruchamia ponownego researchu firmy, lecz może korzystać z niego w odrębnym przygotowaniu.

### R-18 — treść, dowody i zakres researchu

Research obejmuje firmę, produkty/projekty, metody i warunki pracy, technologie i sygnały ryzyka. Istotne ustalenia mają źródła i daty; fakty, opinie, hipotezy, niewiadome i zalecenia są rozróżnione. Pochodzenie i zakres odnoszą się do organizacji/projektu/oferty. Cytowania w zapisanym raporcie są widoczne i klikalne. Nie jest wymagane utrwalanie fragmentów cudzych treści bez ustalonej podstawy.

**AC-18:** każde istotne twierdzenie przedstawione jako fakt ma powiązany dowód, a sam spis odwiedzonych stron nie wystarcza. Informacja z innej oferty nie staje się wymaganiem tej oferty. Źródło z samego wyniku wyszukiwania jest odróżnialne od odczytanej strony. Brak wiarygodnych informacji jest dopuszczalnym jawnym wynikiem. Hipoteza lub opinia nie jest prezentowana jako potwierdzony fakt.

### R-19 — przygotowanie do rozmowy

Przygotowanie zawiera kontekst firmy/projektu, mapę technologii, priorytety powtórki, pytania techniczne do ćwiczeń i pytania do firmy, z uzasadnieniem związku ze stanowiskiem i lukami profilu.

**AC-19:** właściciel widzi, czego i dlaczego ma się uczyć dla wybranej oferty. Pytania do ćwiczeń są oznaczone jako propozycje, bez twierdzenia, że wystąpią na rozmowie. Informacja ręczna ze źródłem „rekruter” uzupełnia przygotowanie tym samym mechanizmem co inna notatka źródłowa.

## Otwarte kwestie

Powiązane: O-03, O-05, O-06. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.

## Etap F1 — profile firm, 2026-11-04

Zakres realizacji: trwałe profile, ręczne przypisania ról, lista i szczegóły, technologie z ogłoszeń. Podstawa: R-15 i R-18 oraz polecenie właściciela kontynuowania po ocenach. Automatyczny research, raporty i przygotowanie pozostają kolejnymi etapami; otwarte progi ich uruchamiania nie blokują F1.

- **AC-F1:** właściciel tworzy profil jako organizację, markę albo podmiot o nieustalonej tożsamości. Nazwa, opcjonalna strona i opis nie stanowią automatycznego potwierdzenia spółki. Profile o tej samej nazwie/domenie pozostają osobne.
- **AC-F2:** lista umożliwia wyszukiwanie i sortowanie; szczegóły pokazują wszystkie przypisane ogłoszenia oraz ich role. Publikujący, zatrudniający i klient są osobnymi powiązaniami; brak jest jawnie oznaczony.
- **AC-F3:** z oferty można stworzyć profil albo wybrać istniejący oraz przypisać rolę z uzasadnieniem. Podpowiedź zgodnej nazwy nie jest przypisaniem. Zmiana aktualnej treści ogłoszenia nie zmienia potwierdzonych powiązań.
- **AC-F4:** przypisanie lub odpięcie zapisuje historię z uzasadnieniem i datą. Jedno ogłoszenie ma najwyżej jeden profil w danej roli. Konflikt równoczesnej zmiany wymaga przeładowania, a ponowienie tej samej komendy nie dubluje profilu ani historii.
- **AC-F5:** technologie z ogłoszeń wskazują konkretną ofertę i required/optional/unknown. Zbiorczy wykaz jest opisany jako technologie z powiązanych ofert, bez twierdzenia, że firma używa ich wewnętrznie. Bezpośredni stos firmy pozostaje nieustalony, szczególnie dla agencji i nieznanego klienta. Nie wykonujemy AI ani płatnego researchu w F1.

## Etap F2 — ręczny research podstawowy, 2026-11-04

Realizowany zakres R-17 i R-18 oraz ręczna część R-16. Progi automatyzacji i research pogłębiony pozostają późniejszymi etapami.

- **AC-F6:** właściciel uruchamia badanie z dokładnego profilu firmy. Przed zleceniem widzi maksymalną rezerwację wspólnego budżetu AI. Do usługi trafiają nazwa, rodzaj, strona i opis firmy; profil zawodowy i CV nie są wysyłane. Brak konfiguracji uniemożliwia płatne zlecenie.
- **AC-F7:** ponowne wejście i zwykłe uruchomienie wykorzystują gotowy raport. Odświeżenie jest osobną jawną akcją. Równoczesne zlecenia zwracają jedną operację; ponowienie komendy nie generuje nowego kosztu. Brak budżetu pozostawia zlecenie oczekujące.
- **AC-F8:** raport obejmuje działalność, projekty, pracę, technologie i ryzyka, z jawnymi niewiadomymi. Ustalenia rozróżniają fakt/opinię/hipotezę/niewiadomą/zalecenie i zakres firma/projekt/oferta. Fakty i opinie mają źródła powiązane z treścią, URL, datę oraz oznaczenie wyniku wyszukiwania albo odczytanej strony. Dowód źródłowy nie oznacza niezależnej weryfikacji prawdziwości deklaracji wydawcy. Nie zgadujemy spółki ani technologii klienta.
- **AC-F9:** kolejne ukończone raporty zachowują wersje. Błąd albo przerwanie nie usuwa dotychczasowego raportu. Niepewny koszt pozostaje zarezerwowany; nie ponawiamy automatycznie płatnej próby. UI pokazuje stan i historię, a źródła są klikalne.
