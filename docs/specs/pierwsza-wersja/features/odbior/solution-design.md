# Odbiór całego przepływu — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-30/AC-30.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Plan integracyjny

Wszystkie poniższe sprawdzenia są planem; wykonano wyłącznie ręczne próby jednorazowej makiety, opisane w [README prototypu](../../../../prototypes/przeglad/README.md).

| Scenariusz / metoda | Pokrycie | Obserwowany dowód |
| --- | --- | --- |
| Profil z kontrolnymi kontaktami, korekta i nowe wejście oceny | R-01, R-02, R-27 | Wersje profilu; brak kontaktów w requestach AI/logach; filtry widoku nie zmieniają pobierania. |
| Mapper i fixture braków/sprzeczności, test reguł lokalnych | R-03, R-04, R-21 | Brak widełek ≠ zero, nieznana dostępność ≠ wykluczenie; waluty/podstawy nie mieszają się. |
| Rzeczywiste SOLID.Jobs + kontrolne wielostronicowe API | R-04–R-08 | Zapis wszystkich stron, jeden rekord na klucz, częściowy błąd bez fałszywego zniknięcia. |
| Zmiana zakresu, 429, zmieniająca się paginacja, powrót ogłoszenia | R-05–R-07 | Pełność/niepełność i last full poprawne, brak nieuzasadnionej aktualizacji dostępności. |
| Merge/split/rozbieżności na bazie z aplikacjami | R-08–R-10, R-22 | Zachowane źródła, notatki, wszystkie aplikacje i historia, ręcznie wybrana wartość nie znika. |
| Istotna zmiana vs zmiana HTML; późny wynik starej próby | R-11, R-14, R-29 | Nowa wersja, brak zbędnego AI, stary wynik nie staje się bieżący. |
| Kalkulator na ustalonych przykładach z niewiadomymi | R-12–R-14 | Powtarzalność, poprawne wagi/kompletność/null; przeliczenie bez sieci, historia ocen. |
| Dwie spółki o wspólnej domenie, agencja, nieznany klient | R-15, R-18 | Brak scalenia nazwą; zachowany zakres i role, brak przenoszenia technologii klienta. |
| Dwie równoległe kwalifikacje firmy, nowa oferta, ręczne refresh | R-16–R-18 | Jedna operacja auto, brak TTL, osobne wersje basic/deep, dowody przy twierdzeniach. |
| Ręczny przegląd researchu i przygotowania | R-18, R-19 | Źródła otwierają właściwy materiał; hipotezy/opinie jawne, tematy wynikają z oferty/profilu. |
| Przeglądarka: oferta → firma → inna oferta, notatki i dwie rozmowy | R-20–R-24 | Poprawne identyfikatory, historia, terminy i dane po odświeżeniu oraz restarcie. |
| Dwie rezerwacje na ostatnie środki, timeout, retry, zmiana miesiąca | R-25, R-26 | Atomowy limit, zachowana niepewna rezerwa, najwyżej 2 auto próby, poprawny miesiąc. |
| Ręczne zadanie przed oczekującym automatycznym researchem | R-26 | Kolejność startu po zakończeniu aktywnego zadania, brak obejścia budżetu. |
| Lokalny dostęp bez logowania, sieć Compose, przegląd logów i bundle | R-27, R-28 | UI/API dostępne na loopback, brak publicznej bazy i sekretów, działający autostart. |
| Kill workera w punktach przed/po wywołaniu i przed/po commit | R-24–R-26, R-29 | Checkpointy, brak podwójnego wyniku, stan kosztu do ustalenia bez fikcyjnego zera. |
| Odtworzenie kontenerów z zachowaniem wolumenu, długa przerwa | R-05, R-28, R-29 | Wszystkie dane i rezerwacje zachowane, jedno zaległe pobranie, brak zależności od karty. |
| Wspólny odbiór całego przepływu i 20 zróżnicowanych ocen | R-30 i całość | Raport z identyfikatorami wejść, kosztami, błędami i decyzją właściciela. |

## Raport i granice odbioru

Propozycja SD: raport odbioru odnosi wyniki do stałych identyfikatorów R/AC, zapisuje wersje danych/modelu/promptu, rzeczywiste koszty, odchylenia i ocenę właściciela dla 20 ofert. Testy funkcjonalności są podstawą, a scenariusze integracyjne sprawdzają ich współpracę. Nie przyjmujemy, że sama liczba przejrzanych ofert dowodzi poprawności wszystkich reguł.

Wdrożenie VPS, konfiguracja zewnętrznej usługi kopii i test odtworzenia jej backupu pozostają poza odbiorem aplikacji. Odtworzenie kontenerów na zachowanym wolumenie sprawdza trwałość uruchomienia, nie backup. Nie wpisujemy sukcesu testu, którego jeszcze nie wykonano.


## Integracja z pozostałymi funkcjonalnościami

[profil](../profil/requirements.md), [pobieranie](../pobieranie/requirements.md), [oferty](../oferty/requirements.md), [dopasowanie](../dopasowanie/requirements.md), [firmy-research](../firmy-research/requirements.md), [przeglad](../przeglad/requirements.md), [rekrutacje](../rekrutacje/requirements.md), [operacje](../operacje/requirements.md), [uruchomienie](../uruchomienie/requirements.md). Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Przejść wszystkie scenariusze integracyjne i zebrać decyzję właściciela oraz zidentyfikowane odchylenia. Przegląd 20 ofert obejmuje dobre, słabe i niepewne dopasowania. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. Ten plan integracyjny sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-01, O-02, O-03, O-04, O-05, O-06, O-07 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.
