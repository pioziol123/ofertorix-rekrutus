# Etap 9: Odbiór i stopniowe włączenie — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 9 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.10`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Odbiór pełnego przepływu, zgodności migracji, UI i mieszanej instalacji. Przygotowanie instrukcji uruchomienia oraz powrotu do OpenAI dla nowych zleceń. Bez masowego przeliczenia danych i bez nowej funkcjonalności domenowej.

Pokrycie przekrojowe: LA-01–LA-10. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 6 i 8 oraz ich zależności. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E09-R01 / E09-AC01 | Działające warianty konfiguracji | Zademonstrowano OpenAI legacy, lokalny profil/oceny z OpenAI research oraz wszystkie trzy zastosowania lokalnie z jawnym źródłem wyszukiwania. |
| E09-R02 / E09-AC02 | Zgodność danych po migracji | Na kopii z oczekującymi partiami i historią wdrożenie zachowuje możliwość odbioru, archiwizacji i cleanup. Nowe lokalne zadania nie zmieniają starych konfiguracji. |
| E09-R03 / E09-AC03 | Czytelny pełny przepływ | Właściciel rozpoznaje model, dostawcę, stan, częściowe wyniki, błąd i anulowanie; zatwierdza profil, przegląda oceny i otwiera źródła researchu. |
| E09-R04 / E09-AC04 | Odporność i koszty | Restart, duplikat dostarczenia i zmiana ustawień nie dublują publikacji ani aktywnej sesji. Lokalna praca działa przy wyczerpanym płatnym budżecie; narzędzia płatne przestrzegają budżetu. |
| E09-R05 / E09-AC05 | Bezpieczna zmiana nowych zleceń | Powrót konfiguracji do OpenAI przekierowuje wyłącznie nowe operacje, pozostawiając lokalną historię i obsługę aktywnych zadań. Brak automatycznego fallbacku. |
| E09-R06 / E09-AC06 | Udokumentowany wynik pilota | Raport wskazuje wersje, sprzęt, parametry, próbki, czas, walidację i przegląd jakości przez właściciela; nie przedstawia niewykonanych prób jako zaliczonych. |

## Zależności i gotowość

Odbiór pełnego lokalnego researchu wymaga zamknięcia O-L1–O-L3 i przeglądu dokumentów. Jeśli etap częściowy przeszedł, można odebrać wyłącznie ten zakres; nie oznacza to odbioru całości.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
