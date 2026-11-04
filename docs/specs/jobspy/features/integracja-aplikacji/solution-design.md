# Integracja JobSpy z aplikacją — solution design

Status: zaimplementowane i zweryfikowane offline, 2026-11-02. Pokrywa [R-I01–R-I08](requirements.md). Ścieżki względem repo aplikacji, poza wskazaną kopią forka. Live pozostaje wyłączone. Poniższe kontrakty opisują zrealizowane podejście; wyniki kontroli podano na końcu.

## Granice i dystrybucja

Worker Node uruchamia proces zainstalowanego Pythona bez powłoki. Skrypt `scripts/jobspy-runner.py` czyta pojedyncze wejście JSON ze stdin, waliduje `IndeedRequest` i wypisuje `RunResult` jako jeden JSON. W razie błędu zwraca stały kod/komunikat, bez payloadu i tracebacku. Web nie uruchamia tego skryptu.

Zweryfikowany wheel forka z lokalną wersją `1.4.1+oferty.1`, SHA-256 oraz requirements z hashami pochodzące z `uv.lock` trafiają do `integrations/jobspy/`. Jest to dystrybucja zależności, nie druga edytowalna kopia jej kodu. Kanoniczny kod pozostaje w osobnym forku GitHub. Manifest wskazuje bazę, wersję kontraktu i commit forka. Obraz `worker` rozszerza dotychczasowy obraz Node o Python/venv i instaluje zależności z hashami oraz lokalny wheel bez ponownego rozwiązywania zależności. `.local` jest wyłączone z kontekstu Dockera.

## Proces i kontrakt

`lib/sources/jobspy.ts`: parametry startowe: search_term=Senior PHP, country_indeed=poland, location=Poland, limit=50, domyślne pozostałe pola i polityka HTTP kontraktu1. Fingerprint obejmuje nazwę źródła, wersję adaptera i zapytanie. Zmiana parametrów tworzy nowy zakres; nie zakłada pełności rynku.

`JOBSPY_ENABLED` domyślnie false. Tylko wartość `true` dopuszcza ręczne enqueue i wykonanie. Brak automatycznego harmonogramu. `JOBSPY_PYTHON` wskazuje konkretny interpreter w obrazie, a `JOBSPY_RUNNER_PATH` skrypt. Nie przekazujemy argumentów z powłoki ani ścieżki kontrolowanej żądaniem użytkownika. Timeout całego procesu: 120s, output: 8MiB łącznie stdout/stderr. Po przekroczeniu kończymy grupę procesów i czekamy na zakończenie. Środowisko jest tworzone z dozwolonej listy, bez dziedziczenia sekretów. Stderr jest jedynie liczony, nie logowany ani przechowywany.

Walidacja Zod sprawdza schema_version=1, source=indeed, jawne stałe upstream_revision i fork_revision zgodne z manifestem, daty z przesunięciem strefowym, jawne kody stop_reason i warnings, typy liczników/statusu oraz identyczność query z parametrami zakresu. Rekordy walidujemy oddzielnie; id musi być stabilnym identyfikatorem Indeed, URL musi prowadzić do Indeed przez HTTP(S). Złe rekordy i duplikaty zwiększają diagnostykę i częściowość. Koperta failed z rekordami nie jest uznawana za udany odczyt. Źródłowy JSON nie trafia do tekstu błędu.

## Kolejka i trwałość

Nowy `lib/sources/jobspy-sync.ts` korzysta z istniejących tabel source_scopes/runs/ads/revisions/run_seen i osobnej kolejki `source-indeed-jobspy`. Stan i blokady dotyczą całego źródła Indeed, a nie tylko fingerprintu; pojedynczy aktywny przebieg chroni advisory lock przy enqueue, osobny lock wykonania i ponowny check statusu. Delivery skończonego przebiegu nic nie robi.

Wspólny zapis ofert i transakcja zostają wydzielone z `sync.ts` do `lib/sources/store.ts`; logika stronicowania i wygaszania SOLID pozostaje w starym importerze. Jego recovery zostaje ograniczone do zakresów source=solid-jobs, aby nie przejmował przebiegów Indeed. JobSpy ma własne recovery.

Migracja dodaje nullable `diagnostics jsonb` do source_sync_runs. JobSpy zapisuje metadane kontraktu bez listy jobs, wraz z liczbą odrzuceń/duplikatów adaptera TS. Status complete oznacza zakończone zapytanie bez znanych braków; limited/partial mapuje się na partial i zachowuje dokładny stan w diagnostics. Failed pozostaje failed. Nigdy nie wykonujemy aktualizacji availability dla niewidzianych ogłoszeń Indeed.

Normalizowany payload dostosowuje rekord do obecnego czytnika: jobOfferKey, title, company, description, locations, salary, validFrom, experienceLevel. Zachowuje pełny rekord JobSpy w `sourceRecord` i jawne niewiadome kwalifikacji. Nie dodaje daty pobrania do treści hashowanej, żeby nie generować rewizji za sam kolejny odczyt. Źródło=indeed, external_id=kanoniczny id bez prefiksu `in-`. Nie łączymy automatycznie rekordów z SOLID.Jobs.

Salary otrzymuje dodatkowe opcjonalne pole origin. Brak tego pola zachowuje dotychczasowe zachowanie SOLID. portal_estimate/unknown jest dla filtra finansowego niewiadomą, etykieta pozostaje przy kwocie. Typ contract z JobSpy nie jest mapowany na B2B/UoP. is_remote=false nie potwierdza biura: możliwa jest praca hybrydowa. Seniority i technologie nie są zgadywane z zapytania; widok oznacza wymagające sprawdzenia kryteria.

## Obsługa i weryfikacja

Osobny CLI `jobspy:sync [--wait]` i `jobspy:status [run UUID]`; status pokazuje disabled bez uruchomienia procesu. Read-only API `/api/sources/jobspy` pokazuje enabled i ostatni wynik, lista ofert sygnalizuje stan tego źródła osobno. Worker rejestruje kolejkę i recovery, ale niczego sam nie zleca.

Tester otrzymał gotowy kod i wyłączną odpowiedzialność za nowe testy/fixtures. Testy procesu korzystają z syntetycznych programów; testy integracyjne podstawiają kopertę i korzystają z izolowanego Postgresa. Zestaw obejmuje R-I01–I08 i regresje SOLID-only. Live pozostaje wyłączone; nie zmieniono `.env` w celu aktywacji.

Wyniki: 173 testy aplikacji z integracjami PASS; 40 testów forka PASS także z paczki w workerze; lint, typecheck, build Nuxt i obraz worker PASS. Migracja diagnostyki zastosowana; worker zdrowy; API statusu i ofert HTTP200 z enabled=false, scheduled=false. Test pełnej granicy Node→Python→JSON przeprowadzono na podstawionym transporcie. Nie wykonano prób live ani importów Indeed do danych użytkownika.

Doprecyzowanie: parser dat akceptuje jawne przesunięcie strefy czasowej (instancje tego samego czasu), nie tylko zapis z Z. Fork emituje UTC. Nie zmienia to porównywania dat. Pliki testów integracyjnych uruchamiamy kolejno, ponieważ ich schematy PostgreSQL izolują dane, ale nie advisory locks.
