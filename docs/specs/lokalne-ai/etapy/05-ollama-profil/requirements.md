# Etap 5: Ollama gpt-oss:20b i lokalny profil — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 5 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.6`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Pierwsze użyteczne lokalne wykonanie: adapter Ollamy i propozycja profilu. Wspólna wersjonowana konfiguracja oraz koszt lokalny zero. Bez lokalnych ocen i agenta researchu.

Pokrycie przekrojowe: LA-01, LA-03, LA-04, LA-06, LA-08. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 1–2; pilot O-L1 przed uznaniem lokalnej ścieżki za działającą. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E05-R01 / E05-AC01 | Jawny wybór i zgodność starych ustawień | Bez nowej konfiguracji istniejąca instalacja nadal korzysta z OpenAI. Jawny wybór Ollamy wymaga gpt-oss:20b; brak modelu lub błędna kombinacja daje błąd bez fallbacku. |
| E05-R02 / E05-AC02 | Lokalny profil bez OpenAI | Przy braku klucza i cennika OpenAI powstaje poprawna propozycja z cytatami. Zapis profilu nadal wymaga zatwierdzenia; zły JSON lub dowody nie zmieniają aktywnego profilu. |
| E05-R03 / E05-AC03 | Niezmienna migawka wykonania | Zmiana konfiguracji po zleceniu nie przekierowuje próby. Nowa próba używa zapisanych wersji instrukcji, schematu, wejścia, modelu i parametrów; sekrety nie trafiają do historii. |
| E05-R04 / E05-AC04 | Brak kwot i prawidłowy koszt | Ujemne saldo usług płatnych nie blokuje lokalnej propozycji. Koszt API to zero również przy usage=null; brak kwoty tokenów, rund, wywołań lub stałego deadline całej lokalnej pracy. |
| E05-R05 / E05-AC05 | Jawna awaria, przerwanie i kontekst | Brak modelu, awaria połączenia, niepełna odpowiedź, zbyt duży fizyczny kontekst i anulowanie są odróżnialne od poprawnej propozycji; wejście nie jest cicho skracane. |
| E05-R06 / E05-AC06 | Wykonalność na hoście | Pilot wybranego modelu działa z workera i zapisuje wersje, parametry kontekstu, czas, pamięć oraz wynik walidacji na syntetycznym CV. Sam test HTTP offline nie oznacza ukończenia pilota. |

## Zależności i gotowość

O-L1: nie potwierdzono wersji/pamięci/kontekstu wybranego zestawu. Przed implementacją zamknąć dokładne mapowanie done_reason, sposób kontroli przepełnienia i odzyskiwania bez podwójnej inferencji. Env oraz pola konfiguracji są propozycją, nie już istniejącym kontraktem.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
