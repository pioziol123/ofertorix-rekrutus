# Pilot wdrożonych connectorów — 2026-11-03

Zaimplementowano niezależne od forka JobSpy connectory `bulldogjob` i `theprotocol`: Python/curl_cffi Chrome HTTP/2, parser listy i szczegółu Next.js, walidacja i normalizacja TypeScript, wspólny zapis rewizji, kolejka pg-boss, odzyskiwanie przerwanych przebiegów, API, CLI i formularz w `/offers`. Importy są ręczne; technologia i poziom są konfigurowalne. Użyto istniejących zależności obrazu worker, bez nowych pakietów ani migracji tabel.

## Próby przez rzeczywistą kolejkę i bazę

| Źródło | Zakres | Wynik | Strony | Żądania | Ogłoszenia zapisane w przebiegu |
| --- | --- | --- | --- | --- | --- |
| Bulldogjob | PHP, senior, limit 3 | partial / offer_limit | 1 | 4 | 3 |
| theprotocol.it | PHP, senior, limit 3 | partial / offer_limit | 1 | 4 | 3 |
| Bulldogjob | PHP, senior, domyślne limity | complete / exhausted | 1 | 10 | 9 |
| theprotocol.it | PHP, senior, domyślne limity | complete / exhausted | 2 | 27 | 25 |
| theprotocol.it — odświeżenie po korekcie mapowania | PHP, senior, domyślne limity | complete / exhausted | 2 | 27 | 25 |

Identyfikatory pełnych przebiegów: Bulldogjob `21afc245-c947-4f1c-b8e9-1c122ef8c96a`; theprotocol pierwsza próba `168d5d68-dda1-4cb9-8ca4-715b10ed0e3c`, końcowa `c8536783-63ba-4e05-9347-c8db090c611d`. Są do odczytu przez `polish:status`. Ponowne pobranie aktualizuje te same ogłoszenia źródłowe, nie tworzy ich kopii. Rewizje zachowują wcześniejsze payloady. Obecnie zapisano łącznie 34 ogłoszenia obu nowych źródeł; nie deduplikowano między portalami.

Lista PHP theprotocol zawierała 60 pozycji. Poziom senior występował w 25 zachowanych rekordach lub nie pozwalał jednoznacznie wykluczyć zgodności; 35 pozycji o jawnie innym znanym poziomie pominięto. Nazwa stanowiska nie była używana jako dowód seniority. Nie wykonywano masowego importu całych portali ani analizy AI.

## Weryfikacja rzeczywistych danych

Potwierdzono statusy, liczniki i widoczność obu źródeł w API oraz przeglądarce; szczegół oferty Bulldogjob miał pełny tekst opisu. Odczytane warianty theprotocol używały `currencyCode`/`kindCode` oraz trybu `home-office`; mapowanie poprawiono i dodano test regresji. Po odświeżeniu API pokazuje PLN, okres Hour/Month, B2B/UoP i pracę zdalną. Bulldogjob zachowuje także zakresy tekstowe płac, np. 150–180 PLN/h.

Sprawdzono `POST /api/sources/polish`: poprawne zlecenie 200 i wykonanie w kolejce, obcy Origin 403, niepoprawne kryteria 422, błędny Content-Type 415. Obserwowano formularz ręcznego importu oraz oba zakończone przebiegi w `/offers`.

## Kontrole automatyczne

- `pnpm check`: lint, typy Nuxt i worker oraz 212 testów Vitest przechodzą; 83 testy integracyjne są domyślnie wyłączone.
- Osobne uruchomienie `RUN_INTEGRATION=1` dla `polish-sync`, `offers`, `sources` i `jobspy`: 36 testów w 4 zestawach przechodzi w izolowanych schematach PostgreSQL.
- Dedykowany agent tester przygotował 21 testów TypeScript parserów/subprocesu, 15 testów offline Python i 8 testów integracyjnych nowych źródeł. Test Python jest uruchamiany też przez wrapper Vitest w obrazie workera.
- `pnpm build`: produkcyjny build Nuxt przechodzi.

Testy obejmują tożsamość i hosty, raw payload, osobne kontrakty, płace godzinowe i miesięczne, wymagane/opcjonalne technologie, brakujące i nieznane kryteria, limity, challenge, paginację i zmianę licznika, zachowanie częściowych wyników, izolację procesu, deduplikację zleceń, rewizje, odzyskiwanie i brak automatycznego wycofywania niewidzianych ofert.

## Granice

`complete` oznacza zakończenie odczytu konkretnego zakresu przy sprawdzonych licznikach, nie pokrycie rynku ani atomowy snapshot. `marketComplete` pozostaje false. Obowiązują limity opisane w README. Źródła mogą zmienić format lub ponownie odmówić dostępu; wtedy wynik jest niepełny/błędny, poprawne rekordy pozostają zachowane. Nie używano cookies właściciela, przeglądarki do pobierania, proxy, solverów ani kluczy AI.

## Rozszerzenie: Just Join IT i No Fluff Jobs

Dalszy etap z 2026-11-03 dodaje dwa pozostałe źródła do tego samego mechanizmu. Panel `/offers` nazywa się teraz „Polskie serwisy — pobieranie ofert” i zawiera wszystkie cztery źródła.

| Źródło | Zakres | Wynik | Strony | Żądania | Zapisane ogłoszenia |
| --- | --- | --- | --- | --- | --- |
| Just Join IT | PHP, senior, limit 3 | partial / offer_limit | 1 | 4 | 3 |
| No Fluff Jobs — pierwszy pilot przed korektą aliasów | PHP, senior, limit 3 | partial / offer_limit | 1 | 37 | 3 |
| Just Join IT — standardowe limity | PHP, senior | complete / exhausted | 1 | 50 | 49 |
| No Fluff Jobs — po korekcie aliasów, standardowe limity | PHP, senior | complete / exhausted | 2 | 18 | 16 |

Końcowe przebiegi: Just Join IT `288e938a-dcdf-4a18-9abb-2235c72c1ab2`, NFJ `bc1a13b8-1724-4fce-8c43-69174dbdc593`. Odczyt przez API i `readOffers` potwierdził 9 Bulldogjob, 25 theprotocol, 49 Just Join IT i 16 NFJ — łącznie 99 ogłoszeń tych czterech źródeł. Nie łączono ofert między portalami.

Just Join IT używa JSON API `candidate-api/offers` z parametrami `skills`, `keywords`, `keywordType=skill` i obsługiwanym `experienceLevels`; [potwierdzenie filtrów](justjoinit-filtry.md) zawiera źródło frontendowe oraz próby PHP/Go. Tożsamość oparta na `guid` listy i zgodnym `id` szczegółu; wynagrodzenia `currencySource=conversion` nie tworzą dodatkowych wariantów kontraktu w widoku. Szczegół zapisanej oferty odczytany przez lokalne API miał 2594 znaki opisu, 10 technologii i oryginalny zakres 16000–20000 PLN/Month B2B.

NFJ wyłącza salary-match. W próbie źródło zwracało 181 i 69 regionalnych kart na dwóch stronach, mimo `pageSize=20`. Jeden wpis może mieć kilka adresów miast/województw oraz Unicode w ID. Zgodne `reference` listy i szczegółu jest dowodem wspólnej publikacji; rozbieżne reference powodują odrzucenie dopasowania. Przy braku tego dowodu wymagamy zgodności ID bez uwzględnienia wielkości liter. Normalizowany klucz i URL korzystają z kanonicznego `defaultUrl`, a raw zachowuje rekordy źródłowe. W końcowym przebiegu: 160 aliasów, 74 karty o innym znanym poziomie, 16 zapisanych publikacji; razem 250 kart źródłowych. Zero odrzuconych rekordów i nieoczekiwanych duplikatów. Aliasy nie powodują kolejnych żądań szczegółu ani statusu niepełności.

Dodatkowe zabezpieczenia: ścisły typ początku kursora (bool/float/string odrzucane), zmiana totalPages NFJ lub licznika oznacza niepełny przebieg, liczba regionalnych kart jest odrębna od liczby zapisanych publikacji, oryginalne waluty i musts/nices zachowane, daty bez strefy nie są zgadywane. Żadna z nowych ścieżek nie korzysta z cookies właściciela lub AI.

Końcowe kontrole po rozszerzeniu: `pnpm check` — lint, typy i 234 testy standardowe przechodzą; dedykowany agent tester objął źródła 36 przypadkami Python offline oraz 11 testami integracyjnymi czterech źródeł; 22 nowe testy TypeScript JSON/aliasów są częścią zestawu standardowego. Produkcyjny build Nuxt i sprawdzenie formatowania przeszły.
