# Etap 1: Wspólna konfiguracja i budżet — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 1 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.2`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Wydzielenie istniejącej konfiguracji i arytmetyki kosztów z modułu profilu. Konsumentami pozostają profil, dopasowanie i research. Bez Ollamy, nowego formatu konfiguracji, migracji i zmiany zasad finansowania.

Pokrycie przekrojowe: LA-02; fundament LA-03 i LA-06. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Brak wcześniejszego etapu. Przegląd niniejszej pary przed kodem. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E01-R01 / E01-AC01 | Jedna konfiguracja dla dotychczasowych konsumentów | Dla dotychczasowych AI_PROFILE_PRICING_JSON, AI_MATCHING_PRICING_JSON i AI_RESEARCH_PRICING_JSON wynik odczytu i gotowość funkcji są takie jak przed przeniesieniem, także przy błędnym JSON, nieznanym polu lub braku klucza. |
| E01-R02 / E01-AC02 | Niezmienione rozliczenie | Dla tych samych cen i użycia obliczenia dają identyczne kwoty w PLN, a rezerwacja obejmuje ten sam pułap i opłaty dodatkowe. |
| E01-R03 / E01-AC03 | Niezmieniona atomowość budżetu | Przy równoległych zleceniach nie można zarezerwować więcej niż pozwala obecna reguła; granica miesiąca korzysta z Europe/Warsaw i miesiąc próby nie zmienia się przy rozliczeniu. |
| E01-R04 / E01-AC04 | Zachowanie procesów domenowych | Profil, oceny pojedyncze/grupowe i research przechodzą dotychczasowe ścieżki sukcesu, błędu i nieznanego kosztu, bez zmiany żądań dostawcy, stanów ani publikacji. |

## Zależności i gotowość

Brak otwartej decyzji technicznej blokującej przygotowanie refaktoru. Wymagany przegląd pary (O-L4).

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
