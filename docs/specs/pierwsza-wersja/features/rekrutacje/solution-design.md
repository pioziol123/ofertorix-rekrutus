# Zarządzanie rekrutacjami — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-22/AC-22, R-23/AC-23.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Własność danych i kontrakty

| Encja / grupa | Istotne pola i niezmienniki |
| --- | --- |
| Application / Interview / Task / Contact / Note / Tag | Oferta, numer podejścia, kanał, stan i wynik; rozmowy/zadania/terminy, kontakty/notatki z pochodzeniem. Historia nie zależy od stanu ogłoszenia. |

## Proces aplikacji

Propozycja SD: Application wskazuje logiczną ofertę, numer podejścia i kanał wysłania. Jednocześnie jeden bieżący proces tej samej rekrutacji; jawnie wskazane przez właściciela odrębne rekrutacje nie mogą zostać utracone przez połączenie ofert; nowe podejście po zamknięciu nie nadpisuje poprzedniego. Etapy i wyniki zakończenia potwierdzono w Q14 i utrzymuje je R-22. Propozycja SD: oddzielne pola stage oraz nullable outcome; ręczna zmiana etapu i zakończenie zapisują zdarzenie, bez wymuszania przejść po wszystkich etapach. Rozmowy i zadania nie są wartościami enum etapu, tylko odrębnymi rekordami.

Zmiana etapu, terminu lub treści notatki zapisuje dane oraz zdarzenie historii w jednej transakcji, z kontrolą expected version. Moduł nie nasłuchuje zmiany ratingu ani wygaśnięcia jako polecenia zamknięcia aplikacji. Łączenie/rozdzielanie ofert korzysta z jego walidacji przypisań, zwłaszcza gdy istnieją dwa aktywne procesy (potwierdzone Q12). Regułę decyzji i zachowania danych utrzymuje [SD ofert](../oferty/solution-design.md#łączenie-i-rozdzielanie); reprezentacja powiązań wymaga wspólnego przeglądu obu modeli.

## Rozmowy, kontakty i zadania

Propozycja SD: Interview i Task mają własne identyfikatory oraz wiele rekordów na aplikację. Terminy mają strefę i jednoznaczny czas; brak terminu jest dopuszczalnym stanem zadania, nie datą zerową. Kontakty i notatki zawierają pochodzenie informacji i historię korekt. **Potwierdzone Q15:** archiwizacja ofert/procesów i poprawki z historią, bez trwałego kasowania w v1. Propozycja SD: archived_at jest odrębne od etapu i outcome; archiwizacja nie usuwa rekordów ani nie kończy automatycznie rekrutacji. Odczyty mogą uwzględniać archiwalne rekordy, a historię zachowujemy niezależnie od ich widoczności w bieżącym widoku.

Własna decyzja przy ofercie jest osobnym polem od ratingu oraz etapu aplikacji. Komenda oceny AI nie ma uprawnień do jej zmiany. Przygotowanie do rozmowy odsyła do Preparation modułu firm/researchu zamiast kopiować raport.


## Komendy

Nazwy logiczne, nie zamrożone endpointy. Wspólny kontrakt walidacji/wersji/odpowiedzi: [architektura](../../architecture.md#wspólny-kontrakt-komend).

| Komenda | Wejście i skutek |
| --- | --- |
| SaveRecruitmentInfo | Identyfikator aplikacji, typ informacji, dane, provenance, expected version; historia zmiany. |

## Integracja z pozostałymi funkcjonalnościami

[oferty](../oferty/requirements.md), [firmy-research](../firmy-research/requirements.md). Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Dwie rozmowy, zadanie, kontakt i korekta notatki, zakończenie oraz drugie podejście. Sprawdzić historię po restarcie, konflikty edycji, brak zmiany etapu po zmianie ratingu/wygaśnięciu. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-03, O-07 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.
