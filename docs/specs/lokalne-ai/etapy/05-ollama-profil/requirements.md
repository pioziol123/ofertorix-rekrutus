# Etap 5: Ollama gpt-oss:20b i lokalny profil — Requirements

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 5 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.6`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

## Cel i granice

Pierwsze użyteczne lokalne wykonanie: adapter Ollamy i propozycja profilu. Wspólna wersjonowana konfiguracja oraz koszt lokalny zero. Bez lokalnych ocen i agenta researchu.

Pokrycie przekrojowe: LA-01, LA-03, LA-04, LA-06, LA-08. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 1–2; techniczne sprawdzenie API/modelu O-L1, bez pilota jakości. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E05-R01 / E05-AC01 | Jawny wybór i zgodność starych ustawień | Bez nowej konfiguracji istniejąca instalacja nadal korzysta z OpenAI. Jawny wybór Ollamy wymaga gpt-oss:20b; brak modelu lub błędna kombinacja daje błąd bez fallbacku. |
| E05-R02 / E05-AC02 | Lokalny profil bez OpenAI | Przy braku klucza i cennika OpenAI powstaje poprawna propozycja z cytatami. Zapis profilu nadal wymaga zatwierdzenia; zły JSON lub dowody nie zmieniają aktywnego profilu. |
| E05-R03 / E05-AC03 | Niezmienna migawka wykonania | Zmiana konfiguracji po zleceniu nie przekierowuje próby. Nowa próba używa zapisanych wersji instrukcji, schematu, wejścia, modelu i parametrów; sekrety nie trafiają do historii. |
| E05-R04 / E05-AC04 | Brak kwot i prawidłowy koszt | Ujemne saldo usług płatnych nie blokuje lokalnej propozycji. Koszt API to zero również przy usage=null; brak kwoty tokenów, rund, wywołań lub stałego deadline całej lokalnej pracy. |
| E05-R05 / E05-AC05 | Jawna awaria, przerwanie i kontekst | Brak modelu, awaria połączenia, niepełna odpowiedź, zbyt duży fizyczny kontekst i anulowanie są odróżnialne od poprawnej propozycji; wejście nie jest cicho skracane. |
| E05-R06 / E05-AC06 | Dostępność modelu przez API | Worker sprawdza GET /api/tags i znajduje dokładnie skonfigurowany gpt-oss:20b. Brak modelu, niedostępny serwer lub błędna odpowiedź są rozróżnialne. Nie uruchamiamy generacji do oceny jakości; właściciel ocenia wynik przy normalnym użyciu. |

## Zależności i gotowość

Konfiguracja, done_reason, przepełnienie i recovery są określone w SD po przeglądzie 2026-11-05. O-L1 to techniczny test połączenia/modelu podczas realizacji, nie brak decyzji przed kodowaniem. Niewykonany test live nie jest sukcesem.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.

Aktualizacja 2026-11-05: dostępność sprawdzamy przez [GET /api/tags](https://docs.ollama.com/api/tags); wcześniejszy pilot jakości odpowiedzi został zastąpiony oceną właściciela podczas normalnego używania. Testy techniczne i walidatory pozostają wymagane.

## Uzupełnienie po grill-me — zatwierdzone 2026-11-05

LA-11 obejmuje tę ścieżkę wspólną kolejką jednej lokalnej pracy AI razem z researchem. Odbiór wymaga braku równoległej generacji przy mieszaninie profilu, ocen i OpenCode, również między workerami. Unknown zajmuje slot, retry może być queued bez startu. Zły JSON/dowód kończy próbę, bez kolejnej automatycznej generacji; ręczne retry ma niezmienne wejście i konfigurację zgodnie z LA-17. Infrastruktura jest obsługiwana ręcznie (LA-18). Ten etap jest częścią jednego wspólnego wydania z panelem (LA-16), nie osobnym wydaniem. Kontrakt kolejki i direct HTTP: [runtime](../../kontrakty-runtime.md).

E05-AC03 obejmuje niezmienność ręcznego retry po zmianie `.env` i profilu; E05-AC04/05 obejmują wspólny slot z ocenami/researchem, unknown i ręczną procedurę operatora. Pierwszą wspólną kolejkę/slot implementuje ten etap, etap6/8 ją rozszerza bez tworzenia drugiego mechanizmu.
