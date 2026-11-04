# Paczka JobSpy dla workera

Kanoniczny kod: [fork JobSpy](https://github.com/pioziol123/JobSpy/tree/codex/indeed-salary-provenance). Wersja bazowa, stan lokalnych zmian i sumy kontrolne znajdują się w [manifest.json](manifest.json). Wheel to gotowa zależność, nie miejsce edycji kodu biblioteki. Zawiera licencję MIT oryginalnego projektu.

`requirements.txt` jest eksportem `uv.lock` lokalnego wydania, bez grup dev i opcjonalnego MCP, z przypiętymi wersjami i hashami dla wspieranych platform/Pythonów. Docker instaluje zależności z `--require-hashes --only-binary=:all:`, sprawdza `wheel.sha256`, następnie instaluje wheel bez ponownego rozwiązywania zależności. Wersja `1.4.1+oferty.4` zawiera lokalne zmiany ponad `baseRevision`; `localChanges: true` oznacza, że nie zostały jeszcze opublikowane.

Przy aktualizacji zmień kod w osobnym repo, zweryfikuj go z testerem, nadaj kolejną wersję forka i zbuduj paczkę. Umieść nowy wheel, eksport zależności i manifest w tym katalogu; zachowaj tylko używaną wersję. Po autoryzowanej publikacji uzupełnij dokładny commit i potwierdź zgodność plików paczki z nim. Sprawdź licencję, sumy kontrolne, testy oraz budowanie obrazu worker. Nie aktualizuj automatycznie z ruchomej gałęzi main.

Wejście do aplikacji: [runner Python](../../scripts/jobspy-runner.py), [proces i walidacja](../../lib/sources/jobspy.ts), [kolejka i zapis](../../lib/sources/jobspy-sync.ts). Zakres i odbiór: [requirements](../../docs/specs/jobspy/features/integracja-aplikacji/requirements.md).

Uruchomienie źródła pozostaje wyłączone (`JOBSPY_ENABLED=false`). Adapter HTML Indeed jest podłączony do runnera; próba listy Indeed Polska zwróciła HTTP 403, więc źródło pozostaje wyłączone do udanego pilota.

Pozostałe adaptery używają kontraktu 2, Indeed zachowuje kontrakt 1.

- `JOBSPY_SOURCES=bayt` włącza ręczny import Bayt.
- LinkedIn dodatkowo wymaga `JOBSPY_LINKEDIN_ACCESS_CONFIRMED=true`, ustawianego dopiero po uzyskaniu zgody portalu.
- Glassdoor, ZipRecruiter, Naukri, BDJobs i HelloWork można aktywować w JOBSPY_SOURCES dla zdalnych ofert z ich rynków. Miejsce pracy z Polski oceniamy osobno; kraj rekordu nie wyklucza oferty. Google Jobs jest niedostępne.
- Uruchomienie: `docker compose exec worker pnpm jobspy:sync --source bayt --wait`.
- Katalog i ostatnie przebiegi: `docker compose exec worker pnpm jobspy:status`; konkretny przebieg: `pnpm jobspy:status bayt <UUID>`.
- Każdy adapter ma osobną kolejkę, blokadę, zakres i historię. Nie ma harmonogramu.
- Limit pojedynczej próby: 10 żądań HTTP, 90 sekund, maksymalnie 2 próby żądania; proces ma twardy limit 120 sekund. Bayt nie rozszerza lokalizacji po odpowiedzi 404.

## Zgoda i wspólny limit

2026-11-02 właściciel potwierdził zgodę LinkedIn i Indeed na scraping do 1 query/s. Konserwatywnie obejmuje to wszystkie HTTP, szczegóły i ponowienia. Runner wymaga `DOCUMENTS_DIR` na wspólnym wolumenie i serializuje przebiegi plikiem `.jobspy-http.lock`; nie usuwać go podczas działania. W przebiegu zachowany jest odstęp 2 s, przed nowym przebiegiem 1 s. Brak dostępu do blokady uniemożliwia kolekcję. LinkedIn: import ręczny aktywny; [pilot](../../docs/specs/jobspy/features/kontrola-zadan/pilot-linkedin.md). Indeed: adapter HTML zaimplementowany, próba live zablokowana HTTP 403; GraphQL pozostaje wyłączony. Bezpośrednie użycie biblioteki poza runnerem nie korzysta z blokady aplikacji.
