# Kontrakt przebiegu Indeed — solution design

Projekt z 2026-11-02; [R-K01–R-K06](requirements.md). Kod względem `.local/JobSpy`. Nowe `jobspy.integration.collect_indeed` przyjmuje model `IndeedRequest` (`extra=forbid`) i zwraca model `RunResult`. Nie korzysta z Pandas; dotychczasowy `scrape_jobs` zostaje zachowany.

## Semantyka

Adapter Indeed utrzymuje liczbę pominiętych rekordów i powód zatrzymania: `exhausted`, `result_limit`, `no_progress`, `page_error`. Pusta strona z następnym kursorem jest niepewna, nie zakończona. Zmiana dotyczy tylko raportowania, nie rekonstruuje całego rynku. Błędy podają stałe kody, nie treść wyjątków ani odpowiedzi GraphQL.

`RunResult`: `schema_version=1`, `source=indeed`, `upstream_revision` (SHA bazy), `fork_revision` (wersja kontraktu zmian), `started_at`/`finished_at` (UTC), `query` (jawna dozwolona lista pól wejściowych), `status`, `stop_reason`, `skipped_jobs`, `missing_descriptions`, `warnings`, `jobs`. `market_complete` jest zawsze false. Dla `status=completed` koniec dotyczy wyłącznie wybranego zapytania.

Statusy: `failed` dla page_error bez rekordów, `partial` dla page_error z rekordami lub znanych pominięć, `limited` dla result_limit/no_progress, `completed` dla exhausted bez pominięć. Brak opisu degraduje status do partial, ale nie zamienia exhausted w błąd. `stop_reason` zachowuje pierwotną przyczynę zakończenia; status opisuje jakość wyniku. Nieopisany wyjątek daje `unexpected_error` bez szczegółów. Wynik nie jest podstawą do wygaszania ofert.

Wejście jawnie pozwala określić frazę, lokalizację, kraj (domyślnie Poland), limit (1–100), czas publikacji, remote i job_type. Pozostałe parametry są odrzucane. Pełny profil, proxy i nagłówki nie wchodzą do tego kontraktu. Puste frazy są odrzucane. Kontrola żądań zostanie dodana w osobnej funkcjonalności przed użyciem live.

Rekordy serializujemy z pól modelu `JobPost`, z pominięciem jego spłaszczającego serializera, przez JSON-owy adapter Pydantic. `salary_source` zachowuje starą semantykę. Każdy rekord dostaje `site=indeed` oraz `missing_fields`, obecnie obejmujące brak opisu. Wszystkie pozostałe pola modelu zachowują nazwy i wartości.

Testy offline weryfikują reguły R-K01–K06 na podstawionym transporcie oraz publicznym nowym wejściu. Nie wdrażamy globalnych zmian pozostałych adapterów ani CLI. Stałe wersji i bieżący kontrakt utrzymuje `FORK.md`/moduł integracji.
