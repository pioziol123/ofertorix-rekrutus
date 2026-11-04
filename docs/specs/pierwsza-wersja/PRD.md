# Osobisty system ofert pracy — PRD

Status: **zaakceptowany**, 2026-10-31, w ramach [akceptacji pakietu](README.md#historia-akceptacji-i-zmiana-sposobu-pracy). Jawne otwarte kwestie zachowują swój status. Brak implementacji produktu i testów odbiorowych.

## Problem i odbiorca

Jeden właściciel potrzebuje zbierać oferty programistyczne dostępne dla osób pracujących z Polski, oceniać je względem własnego profilu i prowadzić rekrutacje. Potrzebuje również wiedzieć, co firma tworzy, jak pracuje i jakich technologii używa, aby świadomie wybrać oferty i przygotować się do rozmów. To deklarowana potrzeba właściciela, nie wynik pomiaru czasu ani badania rynku.

System ma połączyć te czynności w prywatnym narzędziu. Dane i historia pozostają pod kontrolą właściciela, na jego komputerze, z możliwością późniejszego przeniesienia na własny VPS. Nie przewidujemy innych użytkowników.

## Oczekiwane rezultaty

- Właściciel przegląda wszystkie zapisane oferty, rozumie przyczyny oceny i widzi braki danych.
- Odróżnia rekomendację AI od własnej decyzji i etapu rekrutacji.
- Korzysta z jednego profilu firmy i zachowanego researchu przy kolejnych ofertach.
- Przygotowuje się do konkretnej rozmowy na podstawie źródeł, z odróżnieniem faktów od hipotez i zaleceń.
- Zachowuje notatki, terminy, kontakty oraz historię mimo zmian lub zniknięcia ogłoszenia.
- Kontroluje wydatki na AI i wyszukiwanie bez utraty dostępu do danych.

Dowodami użyteczności pierwszej wersji będą przejście rzeczywistego procesu od importu do rekrutacji oraz wspólny przegląd 20 ocenionych ofert. Nie uzgodniono docelowej liczby ofert, oszczędności czasu ani procentowej zgodności ocen AI z opinią właściciela. Szczegółowy kontrakt odbioru: [wymagania, R-30](features/odbior/requirements.md#r-30--odbiór).

## Zakres pierwszej wersji

1. Profil zawodowy oparty na CV, edytowalne umiejętności i doświadczenie, odrębny kierunek zawodowy, preferencje i wymagania konieczne.
2. Jedno źródło: SOLID.Jobs przez oficjalne API. Początkowy import aktualnego zakresu, następnie codzienne i ręczne wykrywanie nowych oraz zmienionych ogłoszeń.
3. Triage z ratingiem i składowymi, uzasadnieniem, osobną kompletnością oraz historią. Potwierdzone wykluczenie i niewiadoma mają różne znaczenie.
4. Research podstawowy automatycznie po kwalifikacji; oba etapy researchu również ręcznie, pogłębiony na żądanie. Wyniki przypięte do firmy, przygotowanie dodatkowo do oferty/aplikacji.
5. Dwie perspektywy przeglądania: tabela ofert z panelem szczegółów (prototyp A) i widok firm z researchem, technologiami oraz ofertami (prototyp C).
6. Ręczne decyzje, tagi, notatki, kontakty, aplikacje, rozmowy, zadania, terminy, archiwizacja i historia. W v1 bez trwałego kasowania danych.
7. Kontrola budżetu, podgląd operacji, błędów i podsumowania w aplikacji.

Pierwsza wersja obejmuje cały ten przepływ dla jednego źródła. Kolejność realizacji modułów nie zmniejsza zakresu odbioru.

## Typowe przebiegi

**Przegląd nowych ofert.** Po pobraniu właściciel sortuje tabelę po dopasowaniu, porównuje rating z kompletnością, otwiera uzasadnienie i podejmuje własną decyzję. Oferta z nieznanymi widełkami pozostaje dostępna.

**Poznanie firmy.** Z oferty przechodzi do profilu firmy, przegląda research i technologie z ich zakresem. Informacji o innym projekcie nie odczytuje jako wymagań rozpatrywanego stanowiska. Istniejący research jest ponownie używany; nowy raport powstaje na żądanie.

**Przygotowanie do rozmowy.** Właściciel zapisuje aplikację i termin, zleca pogłębiony research oraz przegląda tematy do powtórki i pytania. Może dopisać informację od rekrutera ze wskazaniem jej pochodzenia.

**Zmiana lub zniknięcie ogłoszenia.** Widzi aktualną treść i historię zmian. Istotna zmiana powoduje ponowną ocenę w granicach budżetu. Zniknięcie ogłoszenia nie kończy jego aplikacji.

**Brak środków lub błąd.** Nadal przegląda dane i pobiera bezpłatne oferty. Widzi zatrzymany etap, przyczynę i możliwość wznowienia; ukończone wyniki pozostają dostępne.

## Ograniczenia i wyłączenia

- Budżet startowy: 100 PLN na miesiąc kalendarzowy w czasie polskim, łącznie AI i wyszukiwanie, bez przenoszenia niewykorzystanej kwoty. Koszt VPS osobno. To limit aplikacji, nie zgoda na zakup.
- Potrzebne fragmenty profilu/ofert mogą trafiać do zewnętrznego AI; dane kontaktowe z CV nie są częścią wejścia AI.
- Pierwszy odbiór na Macu właściciela. Harmonogram zależy od dostępności komputera i środowiska uruchomieniowego. Zamknięcie przeglądarki nie zatrzymuje pracy.
- Dostęp prywatny, jedno konto. Na VPS przewidziano dostęp przez tunel SSH.
- Kopie zapasowe wykonuje inna usługa. Aplikacja nie oferuje harmonogramu, retencji ani panelu backupów. Wybór tej usługi i test odtworzenia są poza zakresem odbioru aplikacji.
- Poza pierwszą wersją: kolejne źródła, tablica etapów (prototyp B), powiadomienia poza aplikacją, automatyczne aplikowanie i kontaktowanie się z firmami, publiczna usługa, obsługa innych użytkowników.
- Nie odtwarzamy historii ogłoszeń sprzed pierwszego pobrania. Nie wymagamy widoku pełnych dawnych treści ogłoszeń.

## Etapy i niewiadome

Najpierw powstaje cały lokalny przepływ dla SOLID.Jobs, następnie podlega odbiorowi. Później można osobno wdrożyć VPS oraz dodawać źródła pojedynczo po sprawdzeniu ich interfejsów i warunków użycia.

Przed uruchomieniem właściciel uzupełni profil, wartości filtrów i godzinę pobierania. Progi automatycznego researchu będą kalibrowane na pierwszych ocenach. Dostęp do wybranego API AI, jakość i realne koszty nie zostały jeszcze sprawdzone na koncie. Nie obiecujemy kompletnego pokrycia rynku ani rozpoznania każdej firmy.

Materialne doprecyzowania, które pozostają w szkicu, są zebrane w [rejestrze otwartych decyzji](open-decisions.md#otwarte-decyzje-i-warunki-gotowości); nie należy zastępować ich niejawnie domyślnymi wartościami.

## Źródła i odpowiedzialność dokumentów

Źródłami są [pierwotny wywiad](../../product/ustalenia.md), [słownik](../../../GLOSSARY.md), [prototyp](../../prototypes/przeglad/README.md) i resolution decyzji mapy „Droga do specyfikacji osobistego systemu ofert pracy” (`bd show oferty-pracy-v4t`). Późniejsze decyzje właściciela zastępują wcześniejsze otwarte lub odrzucone propozycje.

| Decyzja | Odczyt w Beads |
| --- | --- |
| Tożsamość ofert, firm i historii rekrutacji | `bd comments oferty-pracy-v4t.4` |
| Wybór pierwszego źródła i granic pobierania | `bd comments oferty-pracy-v4t.5` |
| Kontrakt oceniania, researchu i kontroli kosztów | `bd comments oferty-pracy-v4t.6` |
| Wybór architektury wykonania i przechowywania danych | `bd comments oferty-pracy-v4t.7` |
| Przegląd ofert i firm oraz obsługa etapów procesu | `bd comments oferty-pracy-v4t.8` |
| Kryteria gotowości pierwszej wersji do specyfikacji | `bd comments oferty-pracy-v4t.9` |

PRD określa cel i zakres. Każda funkcjonalność ma własną [parę requirements/solution-design](README.md#funkcjonalności): wymagania utrzymują jej reguły i kryteria, a SD mechanizmy oraz weryfikację. [Architektura wspólna](architecture.md) opisuje wyłącznie kontrakty przekrojowe. Beads przechowuje status prac i historię decyzji, nie zastępuje tych dokumentów.

## Sposób rozwijania specyfikacji

PRD i potwierdzone decyzje określają podstawę projektu. Pary requirements/solution-design istnieją jako robocze szkice: dopracowujemy i przeglądamy konkretną parę przed realizacją danej funkcjonalności, w kontekście aktualnego stanu aplikacji. Nie wymagamy szczegółowego zaprojektowania wszystkich funkcjonalności przed rozpoczęciem pierwszej. Szczegóły: [cykl pracy](README.md#cykl-pracy-nad-funkcjonalnością).

## Zmiana decyzji: dostęp bez logowania — 2026-10-31

Właściciel wycofał wymóg konta i sesji: narzędzie osobiste działa bez logowania. Dostęp pozostaje prywatny przez loopback lokalnie i tunel SSH na VPS. Szczegóły R-27 w wymaganiach uruchomienia.
