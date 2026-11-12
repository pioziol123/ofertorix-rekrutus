# Etap 1: Wspólna konfiguracja i budżet — Requirements

Status: **przegląd techniczny zakończony**, 2026-11-05. Etap 1 z dziewięciu, przygotowany do implementacji w dotychczasowym zakresie refaktoru bez zmiany zachowania. Stan realizacji i gotowość zadania: Beads `oferty-pracy-334.2`; wynik przygotowania: `oferty-pracy-334.19`. Przegląd nie oznacza wykonania refaktoru ani testów aplikacji.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Ten etap ustala wyłącznie równoważne wydzielenie istniejącego mechanizmu; nowe wykonanie lokalne należy do dalszych etapów.

## Cel i granice

Wydzielenie istniejącej konfiguracji i arytmetyki kosztów z modułu profilu. Konsumentami pozostają profil, dopasowanie i research. Bez Ollamy, nowego formatu konfiguracji, migracji i zmiany zasad finansowania.

Pokrycie przekrojowe: LA-02; fundament LA-03 i LA-06. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Brak wcześniejszego etapu implementacyjnego. Przegląd pary i lokalnego kodu wykonano 2026-11-05. Przy rozpoczęciu implementacji odświeżyć stan katalogu, uwzględnić zastane zmiany adaptera i zapisać bazowy wynik wymaganych sprawdzeń. Przegląd dotyczy bieżącego katalogu roboczego, nie wyłącznie HEAD.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E01-R01 / E01-AC01 | Jedna konfiguracja dla dotychczasowych konsumentów | Dla dotychczasowych AI_PROFILE_PRICING_JSON, AI_MATCHING_PRICING_JSON i AI_RESEARCH_PRICING_JSON wynik odczytu i gotowość funkcji są takie jak przed przeniesieniem, także przy błędnym JSON, nieznanym polu lub braku klucza. Każdy konsument konfiguracji, kosztów i typu korzysta z ich wspólnego właściciela w lib/ai; nie pobiera ich przez profil. |
| E01-R02 / E01-AC02 | Niezmienione rozliczenie | Dla tych samych cen i użycia obliczenia dają identyczne kwoty w PLN, a rezerwacja obejmuje ten sam pułap i opłaty dodatkowe. |
| E01-R03 / E01-AC03 | Niezmieniona atomowość budżetu | Sprawdzenie dostępności, zapis próby i zlecenie pracy pozostają w tej samej transakcji wywołującego. Samo sprawdzenie nie tworzy próby ani nie zatwierdza transakcji. Przy równoległych zleceniach nie można zarezerwować więcej niż pozwala obecna reguła; granica miesiąca korzysta z Europe/Warsaw i miesiąc próby nie zmienia się przy rozliczeniu. Nieudane zlecenie kolejki wycofuje również zapis próby. |
| E01-R04 / E01-AC04 | Zachowanie procesów domenowych | Profil, oceny pojedyncze/grupowe i research przechodzą dotychczasowe ścieżki sukcesu, błędu i nieznanego kosztu, bez zmiany żądań dostawcy, stanów ani publikacji. |

## Zależności i gotowość

O-L4 dla zakresu etapu 1: przegląd wykonany. Nie zidentyfikowano materialnej decyzji produktowej ani technicznej wymagającej rozstrzygnięcia przed tym wydzieleniem. Implementacja nadal musi wykazać E01-AC01–04; obecność dokumentów lub plików nie jest dowodem spełnienia kryteriów. Bramki T01–T05 późniejszego wykonania lokalnego nie blokują tego refaktoru.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
