# Kontrola żądań Indeed — solution design

Projekt 2026-11-02 dla [R-H01–R-H05](requirements.md). Nowy moduł `jobspy/http_control.py` w osobnym forku; istniejące `RequestsRotating` pozostaje bazą, lecz nowa integracja nie przyjmuje proxy.

`RequestPolicy` Pydantic (`extra=forbid`): `max_requests` domyślnie 10 (1–100), `max_seconds` 90 (1–300), `timeout_seconds` 15 (>0, ≤30), `min_interval_seconds` 2 (1–60), `max_attempts` 2 (1–3). Liczby czasu muszą być skończone. Są to wybrane konserwatywne limity techniczne środowiska, nie potwierdzenie akceptowanego tempa przez Indeed.

`ControlledRequests` utrzymuje monotoniczny deadline oraz licznik prób. Wyłącza automatyczne redirecty, żeby biblioteka requests nie wykonywała dodatkowych żądań poza kontrolą. Każda próba rezerwuje licznik przed wywołaniem transportu; timeout jest minimum ustawienia i pozostałego czasu. Minimalny odstęp dotyczy początków prób na stronach i ponowieniach. Backoff to 1, 2 sekundy ograniczone budżetem i minimalnym odstępem; poprawne Retry-After ma pierwszeństwo.

`RequestStopped` niesie stały bezpieczny kod: `request_limit`, `deadline`, `rate_limited`, `transport_error`. Adapter zachowuje pobrane oferty i kod. Wynik kontraktu ma `request_count`; request_limit/deadline to limited, rate_limited/transport_error to failed bez ofert i partial z ofertami. Pominięte oferty i brak opisów mogą dodatkowo dać partial. Inny błąd HTTP przechodzi do istniejącego page_error, bez ujawnienia payloadu.

`Indeed(policy=None)` zachowuje dotychczasowy transport dla kompatybilności starego `scrape_jobs`; `collect_indeed` przekazuje jawne `request.http`. Po zakończeniu odczytu zamykamy sesję. To nie globalny limiter wielu procesów; na pierwszym uruchomieniu aplikacja będzie musiała zapewnić jeden aktywny przebieg źródła oraz twardy timeout procesu. Dalszy etap integracji pozostaje nieaktywny do rozstrzygnięcia dostępu.

Weryfikacja: podstawiony monotoniczny i ścienny zegar, sleep przesuwający czas, odpowiedzi i wyjątki requests, brak sieci. Sprawdzenie liczby prób, opóźnień, Retry-After, braku ponawiania 403 i przejścia do wyniku częściowego. Testy kontraktu i płac pozostają regresjami całego forka.

## Wspólna blokada aplikacji — 2026-11-02

R-H06–R-H07: runner używa `flock(LOCK_EX)` na `DOCUMENTS_DIR/.jobspy-http.lock`, na współdzielonym wolumenie Docker Compose. Trzyma blokadę przez cały odczyt, przed rozpoczęciem czeka 1 s. Plik nie jest usuwany, aby nie zmienić inode. System zwalnia blokadę również po zabiciu procesu; nowy właściciel ponownie odczekuje 1 s. Wewnątrz przebiegu zachowujemy istniejącą synchroniczną kontrolę HTTP z odstępem 2 s, wyłączonymi redirectami i ograniczonymi ponowieniami. Te same zasady dotyczą pobrania szczegółów LinkedIn. Oczekiwanie na blokadę wlicza się do twardego limitu 120 s procesu; przeciążony import może zakończyć się błędem zamiast wykonać dodatkowe żądania.

Node przekazuje jedynie ścieżkę `DOCUMENTS_DIR` dodatkowo do istniejącego minimalnego środowiska, bez sekretów. Brak katalogu/env lub możliwości otwarcia blokady powoduje bezpieczny błąd runnera przed siecią. Ta gwarancja dotyczy runnera aplikacji na jednym współdzielonym wolumenie, nie niezależnych instalacji czy bezpośredniego użycia biblioteki. Nowe wdrożenie na osobnym hoście wymaga wspólnego limitera lub wyłączenia równoległego importu. Testy offline obejmują procesy równoległe, odstęp między przebiegami, zwolnienie po awarii i błąd blokady; istniejące testy HTTP obejmują odstępy i ponowienia.
