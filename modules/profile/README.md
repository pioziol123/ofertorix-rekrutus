# Profil zawodowy

Docelowa architektura modułu `modules/profile/`. Moduł odpowiada za import CV, przygotowanie propozycji danych z CV, edycję szkicu oraz zatwierdzanie i odczyt wersji profilu zawodowego. [Słownik domenowy](../../GLOSSARY.md) · [Mapa modułów](../../docs/architecture/moduly.md)

## Dane profilu

- **Doświadczenie i umiejętności** opisują dotychczasową pracę właściciela. Dane przyjęte z CV mogą wskazywać import, rewizję tekstu i cytat, z którego pochodzą.
- **Kierunek zawodowy** określa poszukiwane role, poziom stanowiska, technologie do rozwoju i oczekiwany rodzaj pracy.
- **Oczekiwania i wykluczenia** opisują warunki przyszłej pracy, np. tryb pracy, minimalne wynagrodzenie lub wykluczone branże. Podane oczekiwanie może być wymaganiem koniecznym albo preferencją. Brak informacji pozostaje niewiadomą. Właściciel może też jawnie wskazać brak preferencji.

Dopasowanie pobiera aktywną wersję profilu wraz z jej identyfikatorem i stosuje własne reguły oceny. Zakres pobierania ogłoszeń określają Źródła ofert, a filtry przeglądania zapisanych ofert należą do Ofert.

## Publiczne operacje

| Operacja                          | Kontrakt                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import CV                         | Przyjmuje dokument lub wklejony tekst. Zwraca identyfikator importu i stan przygotowania tekstu.                                                                       |
| Odczyt importu                    | Udostępnia stan importu, tekst do przejrzenia, stan i wynik przygotowania propozycji oraz oryginalny plik, jeśli został przesłany.                                     |
| Zlecenie przygotowania propozycji | Przyjmuje wybrany tekst i oczekiwaną rewizję importu. Zapisuje rewizję tekstu używaną do przygotowania propozycji i zleca wykonanie.                                   |
| Zastosowanie propozycji           | Przyjmuje identyfikator importu, rewizję tekstu, wybór elementów i oczekiwaną rewizję szkicu. Dodaje wybrane pozycje lub zastępuje pozycje wskazane przez właściciela. |
| Odczyt i zapis szkicu             | Udostępnia edytowalne dane z identyfikatorem rewizji. Zapis sprawdza oczekiwaną rewizję, żeby wykryć zmianę od czasu odczytu.                                          |
| Zatwierdzenie profilu             | Przyjmuje oczekiwaną rewizję szkicu i identyfikator dotychczasowej wersji aktywnej. Tworzy niezmienną wersję i aktywuje ją w jednej operacji.                          |
| Odczyt zatwierdzonych wersji      | Udostępnia aktywną wersję wraz z jej identyfikatorem, informację o braku aktywnej wersji, historię oraz odczyt wskazanej wersji.                                       |

## Od CV do aktywnego profilu

1. **Import i wydobycie tekstu.** Przy imporcie dokumentu moduł zachowuje oryginał i wydobywa tekst do przejrzenia. Jeśli wydobycie się nie powiedzie, właściciel może podać tekst ręcznie. Wklejony tekst od razu jest dostępny do przejrzenia.
2. **Wybór tekstu do analizy.** Właściciel przegląda i może poprawić tekst, po czym zleca przygotowanie propozycji. Moduł usuwa rozpoznane dane kontaktowe i zapisuje rewizję oczyszczonego tekstu. To ta rewizja jest wejściem do analizy i podstawą późniejszej weryfikacji cytatów.
3. **Przygotowanie propozycji.** AI zwraca ustrukturyzowane podsumowanie, umiejętności i doświadczenie. Profil sprawdza zgodność wyniku z kontraktem i obecność cytatów dla umiejętności i doświadczenia w zapisanej rewizji tekstu. Poprawna propozycja jest zapisywana przy tej rewizji. Wynik dla starszej rewizji nie zastępuje propozycji dla nowszego tekstu.
4. **Przegląd i edycja szkicu.** Właściciel ocenia, czy cytaty uzasadniają wnioski, wybiera pozycje do zastosowania i może dopisać lub skorygować dane ręcznie. Zastosowanie propozycji zmienia wyłącznie szkic. Kierunek zawodowy, oczekiwania i wykluczenia właściciel uzupełnia osobno.
5. **Zatwierdzenie.** Właściciel zatwierdza szkic osobną operacją. Nowa wersja staje się aktywna dla Dopasowania, a wcześniejsze wersje pozostają dostępne w historii.

## Podział odpowiedzialności z AI

| Część               | Odpowiedzialność                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profil zawodowy     | Przygotowuje i zapisuje wybrany przez właściciela tekst, zleca przygotowanie propozycji, wiąże wykonanie z rewizją tekstu, sprawdza cytaty, zapisuje wynik i stosuje wybrane zmiany do szkicu. |
| Warstwa integrująca | Przekłada zlecenie na instrukcję i schemat odpowiedzi oraz przekazuje Profilowi identyfikator wykonania, ujednolicony stan i wynik w ustalonym formacie.                                       |
| AI                  | Wybiera dostawcę i model, obsługuje komunikację i kolejkę, koordynuje współdzielone wykonanie lokalne, odzyskuje przerwane wykonania i odpowiada za ponowienia, budżet oraz rozliczenie.       |

Profil korzysta z jednego interfejsu przygotowania propozycji. Wybór dostawcy i sposób wykonania należą do modułu AI.

## Refaktoryzacja

Wydzielenie wykonania propozycji za interfejs modułu AI opisuje zadanie Beads `oferty-pracy-0mq.9` w epiku **Poprawki architektury kodu**.
