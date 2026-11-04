# Import Indeed przez GraphQL — projekt rozwiązania

[Wymagania](requirements.md). Rozstrzygnięcia dla etapu z 2026-11-03: runner używa istniejącego `jobspy.integration.collect_indeed`, który w [pilocie](../../../../research/indeed-graphql-pilot.md) poprawnie przetworzył polskie oferty. HTML pozostaje osobnym nieużywanym adapterem; bez automatycznego fallbacku.

Runner zachowuje `serialized_import`, a adapter `ControlledRequests` z ograniczeniem i jawnie kontrolowanymi ponowieniami; wspólny wolumen zapewnia serializację Indeed i LinkedIn. Wersja adaptera zakresu Indeed wzrasta z 4 do 5, co daje nowy fingerprint bez migracji starych obserwacji. Pozostałe źródła zachowują swoje wersje i konfigurację. Format RunResult v1 i reguły walidacji pozostają bez zmian.

Importer zapisuje poprawne rekordy i rewizje idempotentnie. `limited` / `result_limit` mapuje się na niepełny przebieg, a `market_complete=false` nie pozwala stwierdzić pełnego pokrycia rynku. Błąd 403 w obecnym adapterze jest ogólnym `page_error`, co nadal daje failed lub partial, a nie puste powodzenie; 429 ma własny status `rate_limited`. Brakujące opisy i odrzucone rekordy wpływają na kompletność. Nie wygaszamy niewidzianych ogłoszeń.

Weryfikacja: testy wyboru adaptera, ograniczeń HTTP i walidacji odpowiedzi, integracyjne testy kolejki i bazy, następnie jeden ręczny import ze sprawdzeniem stanu i widoczności. Włączenie dotyczy tylko Indeed, nie dodaje harmonogramu. Żadna z prób nie dowodzi trwałości dostępu do niepublicznego endpointu.

## Pilot kolejki — 2026-11-03

Ręczny przebieg `1fb288dd-47d6-4933-9e2b-271e3caccf6f` wykonał jedno żądanie, zakończył zapytanie (`exhausted`) i zapisał 31 ogłoszeń oraz 31 rewizji, bez odrzuconych rekordów i brakujących opisów. `market_complete=false`: wynik nie jest deklaracją kompletności rynku. API i widok szczegółu zwróciły zapisane ogłoszenia. Spośród 31 tytułów 17 zawierało PHP, 23 Senior, a 13 oba słowa; wszystkie mają oznaczone niepotwierdzone kryteria. Tytuł nie rozstrzyga dopasowania treści. Selekcja pozostaje zadaniem `oferty-pracy-y81.10`.
