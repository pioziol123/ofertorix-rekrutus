# Lokalna praca nad forkiem JobSpy

Data: 2026-11-02. Repozytorium: https://github.com/pioziol123/JobSpy, oryginał: https://github.com/speedyapply/JobSpy.

Potwierdzona baza: `68b88d6909a2342ad75fbb945c4204a3a7ed6665` (2026-10-27), pakiet `python-jobspy` 1.4.1. Lokalna kopia w `.local/JobSpy` jest osobnym repozytorium Git, ignorowanym przez repo aplikacji. `origin` wskazuje fork, `upstream` oryginał. Zmiany aplikacji i forka przeglądamy osobno. Nie jest to jeszcze zależność uruchomieniowa aplikacji.

Gałąź pierwszej zmiany: `codex/indeed-salary-provenance`. Po wyraźnej zgodzie właściciela opublikowano commit `0f2540e0919f4506bec15fe9ae5a17b1246565d6`. Aktualna wersja forka: `1.4.1+oferty.1`. Status: `git -C .local/JobSpy status --short`. Gałąź main forka nie została zmieniona.

Środowisko: Python 3.13, uv, `.venv` wewnątrz forka. `uv.lock` przypina zależności środowiska testowego; upstreamowy `poetry.lock` pozostaje bez zmian. Cache uv poza repo, np. `/tmp/oferty-jobspy-uv`.

```sh
git clone https://github.com/pioziol123/JobSpy.git .local/JobSpy
git -C .local/JobSpy checkout codex/indeed-salary-provenance
git -C .local/JobSpy remote add upstream https://github.com/speedyapply/JobSpy.git
UV_CACHE_DIR=/tmp/oferty-jobspy-uv uv sync --project .local/JobSpy --python 3.13 --all-extras
cd .local/JobSpy
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/ruff check jobspy tests
.venv/bin/mypy
```

Do dokładnego odtworzenia użyj commitu z [manifestu paczki](../../../integrations/jobspy/manifest.json). Repo aplikacji zawiera wheel i eksport przypiętych zależności; worker nie wymaga lokalnej kopii `.local/JobSpy`. Nie dodajemy całej kopii ani jej środowiska do repo aplikacji.

## Integracja w aplikacji

Obraz worker zawiera interpreter `/opt/jobspy/bin/python` i zweryfikowaną paczkę. Web pozostaje bez Pythona. JobSpy nie jest objęty automatycznym harmonogramem; źródło jest domyślnie wyłączone.

- Status: `docker compose exec worker pnpm jobspy:status` lub GET `/api/sources/jobspy`.
- Przyszłe ręczne zlecenie: `docker compose exec worker pnpm jobspy:sync --wait`, dopiero po rozstrzygnięciu dostępu i jawnej aktywacji w konfiguracji. Przy disabled polecenie kończy się bez uruchomienia Pythona i bez zlecenia w kolejce.
- Zmiana konfiguracji wymaga odtworzenia kontenerów, które odczytują flagę. Nie ustawiono aktywacji w `.env`.
- Testy integracyjne (`RUN_INTEGRATION=1`) wykonują pliki kolejno: advisory locks PostgreSQL są wspólne dla bazy, mimo odrębnych schematów danych testowych. Zwykłe testy jednostkowe pozostają równoległe.

Przeprowadzono test syntetycznego transportu pełnej drogi Node → zainstalowany Python → JSON → Zod w kontenerze, bez dostępu do Indeed i bez zapisu ofert do bazy użytkownika. Próba live pozostaje w Beads `oferty-pracy-y81.5`, scraper HTML w `oferty-pracy-y81.8` jako ostatni etap.

## Dostęp do Indeed

Nie wykonano prób scrapowania. [Warunki Indeed, D.21](https://www.indeed.com/legal) ograniczają automatyczny dostęp bez pisemnej zgody z wyjątkiem określonego indeksowania zgodnego z robots.txt. Nie potwierdzono uprawnienia do zakresu używanego przez JobSpy. Kod testujemy na syntetycznych przykładach; regularny importer pozostaje nieaktywny.

Oficjalna [instrukcja dostępu do API](https://docs.indeed.com/getstarted/integrate-and-call-apis) prowadzi do [programu partnerskiego](https://partners.indeed.com/). Należy zapytać o zgodę na wyszukiwanie i lokalne przechowywanie ofert dla osobistego projektu; samo utworzenie aplikacji/OAuth nie potwierdza prawa do każdego zasobu. Właściciel został poinformowany o tej zależności. Nie wysłano zgłoszenia w jego imieniu.

## Aktualizacja dostępu — 2026-11-02

Właściciel potwierdził uzyskanie zgody LinkedIn i Indeed z limitem jednego query/s. Powyższy opis braku zgody jest historyczny. W aplikacji liczymy wszystkie żądania i ponowienia, zachowujemy odstęp 2 s i serializujemy przebiegi runnera na współdzielonym wolumenie dokumentów. LinkedIn jest aktywowany do ręcznego pilota. Indeed HTML pozostaje osobnym zadaniem; GraphQL pozostaje wyłączony. Bezpośrednie uruchamianie biblioteki poza runnerem nie korzysta z blokady aplikacji.
