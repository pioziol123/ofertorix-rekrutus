# Pozostałe źródła JobSpy — solution design

Projekt 2026-11-02, [R-S01–R-S06](requirements.md). Fork bazuje na 0f2540e, nowa paczka 1.4.1+oferty.2. Dotychczasowe collect_indeed / schema1 pozostają kompatybilne. Nie wymagamy migracji danych.

## Fork

Nowy moduł `jobspy.multi_source` udostępnia `SourceRequest` i `collect_source`: jedno jawne źródło na proces. Rejestr mapuje wszystkie adaptery poza Indeed. Kraj walidowany przed wywołaniem scrape: Glassdoor według swojej mapy domen, ZipRecruiter USA/Kanada, Naukri Indie, BDJobs Bangladesz, HelloWork Francja; Google oznaczone jako niedostępne według README. LinkedIn globalny i Bayt z jawną lokalizacją. Dla aplikacji query nadal Poland/Senior PHP.

Schema2 wyniku: jak schema1 z rozszerzonym source, fork_revision=oferty-contract-2 i kodami `unsupported_scope`, `unsupported_source`, `blocked`, `adapter_error`, `unverified`. Query zawiera source i fetch_description. Pełny rekord zachowuje prefiks ID i site, nie przechodzi przez DataFrame. Pochodzenie płacy poza Indeed domyślnie unknown. Nie przenosimy source ani konfiguracji do danych profilu.

Scope kontrolera HTTP jest lokalny dla wywołania (ContextVar). `create_session` dekoruje żądanie rzeczywistej sesji, zachowując jej nagłówki i własności transportu; wspólny budżet obejmuje strony i szczegóły, niezależnie od requests/curl. Bez powłoki, proxy i automatycznych redirectów. Bayt 404 kończy odczyt przed fallbackiem lokalizacji. Utrzymujemy zgodność istniejącego ControlledRequests z testami Indeed. Kontroler zapisuje bezpieczny powód przerwania i liczbę prób.

Istniejące logi adapterów są przechwytywane w obrębie pojedynczego procesu i redukowane do bezpiecznych kodów i liczników; nie wypisujemy raw wyjątków/URL/payloadów. Pominięcia oraz brak opisów dają partial. Bez błędów, ale bez dowodu pełności stronicowania: limited/unverified (także przy zerze ofert). Nie używamy tego jako dowodu wygaśnięcia. Proces nadal ma twardy timeout i ograniczenie wyjścia po stronie Node.

## Aplikacja

`jobspy-catalog.ts` zawiera identyfikatory źródeł, nazwy, prefiksy, hosty URL, wsparcie Polski i powód ograniczenia. `JOBSPY_SOURCES` to jawna lista aktywnych źródeł poza Indeed; domyślnie pusta. Poprzedni JOBSPY_ENABLED dotyczy wyłącznie Indeed. Osobna informacja `requires_access` dla LinkedIn; nie obchodzimy tego przez przypadkowe użycie starej flagi.

Funkcje parametrów/fingerprint/queue przyjmują source, zachowując dotychczasowe domyślne Indeed dla zgodności API/testów. executeJobspy dopasowuje przebieg do źródła kolejki; enqueue/recovery/locks/status działają per source. Worker rejestruje każdą kolejkę, ale bez harmonogramu. CLI przyjmuje --source; status bez source pokazuje katalog. API statusu dodaje listę sources, zachowując stare pola Indeed. Lista ofert pokazuje źródło i statusy wszystkich uruchomionych adapterów.

Po testach nowa paczka, eksport lock i manifest zastępują używaną dystrybucję. Komit/push nowych zmian wymaga osobnej wyraźnej autoryzacji; publikacja poprzedniej paczki nie jest automatyczną zgodą na następny push. Sprawność sprawdzamy bez mylenia testów fixture i live. Źródła ograniczone geograficznie pozostają podłączone z kodem unsupported_scope; nie zmieniamy ich kraju na chybił trafił.

Parser aplikacji pomija rekordy z jawnym krajem innym niż Polska i zlicza `outsideScope`. Brak kraju (również oznaczenie unknown/worldwide/remote) zachowuje jako niewiadomą; nie wywodzi możliwości pracy z Polski z samej flagi remote.

Aktualizacja: geograficzną blokadę aplikacji dla pięciu źródeł i odrzucanie zagranicznych rekordów zdalnych zastępuje [SD ofert zdalnych](../zdalne-zagraniczne/solution-design.md).
