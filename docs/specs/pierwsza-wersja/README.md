# Specyfikacja pierwszej wersji

Status: **PRD i potwierdzone decyzje stanowią podstawę projektu; pary funkcjonalności są szkicami do późniejszego dopracowania.** Właściciel zmienił sposób pracy: requirements i solution-design rozwijamy dla wybranej funkcjonalności bezpośrednio przed jej realizacją, przed napisaniem kodu. Wcześniejsza akceptacja pakietu nie zamraża technicznych propozycji.

## Cykl pracy nad funkcjonalnością

1. Wybrać konkretny fragment do realizacji w granicach PRD.
2. Przejrzeć jego robocze requirements, potwierdzone decyzje i aktualny stan aplikacji. Doprecyzować zachowanie oraz kryteria akceptacji tego fragmentu.
3. Opracować lub zaktualizować jego solution-design, uwzględniając istniejący kod i kontrakty innych modułów.
4. Przejrzeć spójność tej pary i uzgodnić materialne zmiany. Dopiero potem planować zadania implementacyjne i pisać kod.
5. Wnioski z implementacji i weryfikacji przenosić do odpowiednich dokumentów.

Nie domykamy wszystkich SD z wyprzedzeniem. Zależności przekrojowe rozstrzygamy wcześniej tylko w zakresie potrzebnym dla wybranego fragmentu. Szkice późniejszych funkcjonalności można zmieniać, zachowując zaakceptowane reguły produktu; zmiana tych reguł wymaga jawnego uzgodnienia.

## Funkcjonalności

| Funkcjonalność | Wymagania | Requirements | Solution design |
| --- | --- | --- | --- |
| [Profil zawodowy i kryteria](features/profil/requirements.md) | R-01, R-02 | [Requirements](features/profil/requirements.md) | [Solution design](features/profil/solution-design.md) |
| [Pobieranie i synchronizacja ofert](features/pobieranie/requirements.md) | R-04, R-05, R-06, R-07 | [Requirements](features/pobieranie/requirements.md) | [Solution design](features/pobieranie/solution-design.md) |
| [Tożsamość ofert, rozbieżności i historia](features/oferty/requirements.md) | R-08, R-09, R-10, R-11 | [Requirements](features/oferty/requirements.md) | [Solution design](features/oferty/solution-design.md) |
| [Triage i ocena dopasowania](features/dopasowanie/requirements.md) | R-03, R-12, R-13, R-14 | [Requirements](features/dopasowanie/requirements.md) | [Solution design](features/dopasowanie/solution-design.md) |
| [Firmy, research i przygotowanie do rozmowy](features/firmy-research/requirements.md) | R-15, R-16, R-17, R-18, R-19 | [Requirements](features/firmy-research/requirements.md) | [Solution design](features/firmy-research/solution-design.md) |
| [Przeglądanie ofert i firm](features/przeglad/requirements.md) | R-20, R-21 | [Requirements](features/przeglad/requirements.md) | [Solution design](features/przeglad/solution-design.md) |
| [Zarządzanie rekrutacjami](features/rekrutacje/requirements.md) | R-22, R-23 | [Requirements](features/rekrutacje/requirements.md) | [Solution design](features/rekrutacje/solution-design.md) |
| [Operacje w tle i kontrola kosztów](features/operacje/requirements.md) | R-24, R-25, R-26, R-29 | [Requirements](features/operacje/requirements.md) | [Solution design](features/operacje/solution-design.md) |
| [Prywatny dostęp i lokalne uruchomienie](features/uruchomienie/requirements.md) | R-27, R-28 | [Requirements](features/uruchomienie/requirements.md) | [Solution design](features/uruchomienie/solution-design.md) |
| [Odbiór całego przepływu](features/odbior/requirements.md) | R-30 | [Requirements](features/odbior/requirements.md) | [Solution design](features/odbior/solution-design.md) |

Podział służy osobnemu przeglądowi, doprecyzowaniu i późniejszemu planowaniu funkcjonalności. Nie jest podziałem aplikacji na mikroserwisy i nie ustala jeszcze kolejności wdrażania. Identyfikatory R-01–R-30 i AC-01–AC-30 zachowano; każde wymaganie ma jedno miejsce utrzymania.

## Dokumenty wspólne

- [Architektura i kontrakty wspólne](architecture.md) — wybrane technologie, granice modułów i wspólne konwencje. Nie zastępuje SD funkcjonalności.
- [Plan refaktoru AI, Ollamy i lokalnego agenta](../lokalne-ai/README.md) — propozycja rozszerzenia wykonania AI z 2026-11-04; etapowe wymagania, granice i kolejność wdrożenia, bez rozpoczętej implementacji.
- [Otwarte decyzje](open-decisions.md) — O-01–O-07, ich konsekwencje i sposób zamknięcia. Poszczególne pary wskazują dotyczące ich kwestie.
- [Odbiór](features/odbior/requirements.md) — kryterium R-30 oraz [plan integracyjny](features/odbior/solution-design.md) dla całego przepływu.

## Źródła i stan prac

Aktualne decyzje właściciela z mapy `bd show oferty-pracy-v4t` są podstawą szkicu. Pierwotny wywiad `docs/product/ustalenia.md` pozostaje materiałem historycznym; badania w `docs/research/` opisują stan źródeł w podanej dacie. Prototypy A i C określają kierunek UI, nie poprawność reguł.

Historia przygotowania pakietu: `bd show oferty-pracy-4ga`; doprecyzowań i zmiany cyklu pracy: `bd show oferty-pracy-boe`. Nie utworzono zadań implementacyjnych. Nie wykonano płatnych prób ani testów produktu. Nie wykonano commitu/push. PRD i potwierdzone reguły pozostają podstawą. Pary funkcjonalności są materiałem roboczym, nie zatwierdzonym w całości projektem wykonawczym. Otwarte kontrakty rozstrzygamy przy podejmowaniu odpowiedniego fragmentu, bez blokowania projektu pytaniami dotyczącymi odległych funkcjonalności.

## Historia akceptacji i zmiana sposobu pracy

Akceptacja właściciela: „dobra, akceptuję” po przedstawieniu podziału na jeden PRD i 10 par requirements/solution-design. Była to akceptacja ówczesnego pakietu z ograniczeniami. Później właściciel zaakceptował zmianę: jeden PRD i decyzje jako podstawa, requirements/SD jako szkice rozwijane przed konkretną realizacją. Propozycje dotyczące nierozstrzygniętych kwestii w open-decisions.md nadal wymagają decyzji. Status poszczególnych kontraktów opisany w plikach ma pierwszeństwo przed zbiorczym rozumieniem gotowości.

## Doprecyzowania po akceptacji pakietu

Przed kodem wymagany jest przegląd dokumentacji wybranej funkcjonalności; nie jest wymagane ukończenie wszystkich par. Historia doprecyzowań: `bd show oferty-pracy-boe`. Potwierdzone Q1–Q15 przeniesiono do odpowiednich par: import/formularz profilu, kompletność, warianty i widełki, zakres researchu, połączenia aplikacji, miesiąc kosztu, etapy i archiwizacja. Pozostałe otwarte kwestie są nadal w rejestrze; zmiany techniczne wymagają uzgodnionego przeglądu.

Potwierdzone doprecyzowania i historyczny przegląd: [zapis decyzji Q1–Q15](review.md#przeniesione-decyzje). Zalecenie dopracowywania wszystkich SD z tego przeglądu zostało zastąpione powyższym cyklem pracy. Implementacja nie została rozpoczęta.

### Bieżący przegląd profilu — 2026-11-01

Po ukończeniu lokalnego importera i listy wybrano profil. Jego [wymagania](features/profil/requirements.md) i [SD](features/profil/solution-design.md) dopracowano dla kolejnego etapu; pozostałe pary zachowują roboczy charakter. [Próba parserów](../../research/profil-import-spike/README.md) potwierdza tylko podstawową ekstrakcję lokalną. Płatna propozycja AI wymaga wspólnej kontroli kosztów, lokalnej konfiguracji i weryfikacji dostawcy przed uznaniem integracji za działającą.
