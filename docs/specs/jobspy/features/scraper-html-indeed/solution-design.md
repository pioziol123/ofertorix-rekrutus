# Scraper HTML Indeed — projekt rozwiązania

Status: projekt bieżącego etapu, 2026-11-02. [Wymagania](requirements.md). Uzgodnione ograniczenia: HTML, Polska, limit wszystkich HTTP, brak obchodzenia blokad. Poniżej wybory implementacyjne w ramach zleconego zakresu, nie dodatkowe wymagania produktu.

## Granica adaptera

Nowy moduł `jobspy/indeed_html.py` udostępnia `collect_indeed_html(IndeedRequest) -> RunResult`. Nie podmieniamy funkcji collect_indeed ani upstreamowej klasy Indeed. Runner importuje nową funkcję pod dotychczasowym lokalnym aliasem collect_indeed, zachowując wspólną blokadę i JSON. Aplikacja zmienia adapterVersion z 1 na 4 dla Indeed; treść query, schema_version=1 i fork_revision=oferty-contract-1 pozostają zgodne. Nowy fingerprint odróżnia obserwacje HTML od poprzedniej konfiguracji. Inne źródła bez zmian.

## Parsowanie i transport

BeautifulSoup odczytuje karty po data-jk i linkach viewjob?jk, a szczegóły po jobDescriptionText oraz JobPosting z application/ld+json (w tym @graph). Nie wykonujemy JavaScript. Nie próbujemy zgadywać dowolnych zmiennych JS: ich brak przy braku kart i jawnego empty markera to page_error/parser_error. To świadome ograniczenie pierwszego parsera.

Listy są żądane pod pl.indeed.com/jobs z parametrami q/l/start oraz dostępnymi filtrami requestu. Następna strona wynika z jawnego linku next; dozwolone tylko HTTPS, dokładny host pl.indeed.com, ścieżki /jobs i /jobs/. Szczegóły zawsze pod skonstruowanym /viewjob?jk=ID; ID wyłącznie litery/cyfry/_/-. Nie pobieramy URL znalezionych w opisach/JSON-LD. Zbiór odwiedzonych stron i ID zatrzymuje pętlę. Jawny brak wyników jest completed/exhausted; brak rozpoznawalnego HTML to failed lub partial/page_error.

ControlledRequests obejmuje wszystkie GET i retry, wyłącza przekierowania, respektuje Retry-After i limity. Dodatkowa wspólna blokada runnera utrzymuje serializację między procesami na tym samym wolumenie. Blokada/zgoda w HTTP 200 wykrywana przed parserem; 403 i przekierowania są zatrzymaniem, nie obchodzeniem. Limit szczegółów zachowuje pozostałe już odczytane karty bez opisów.

JobPosting mapuje title/hiringOrganization/description/jobLocation/datePosted/jobLocationType. Zwykła lokalizacja tekstowa jest zachowana jako city z nieustaloną strukturą. Brak jawnego TELECOMMUTE pozostawia is_remote=null. Seniority/skills pozostają null. Płace wyłącznie ze struktur baseSalary/estimatedSalary, skończone nieujemne liczby i rozpoznany unitText. Dowód zachowuje pole źródłowe; baseSalary nie potwierdza samodzielnie autorstwa pracodawcy. Opis HTML zamieniony na tekst, bez wykonywania treści. Daty ISO walidowane; nieznane nie są zgadywane.

## Wynik, wydanie i weryfikacja

RunResult/structured_job są autorytatywnym kontraktem. Stop reasons i warnings zgodnie z R-I05; brak opisu wymusza partial. Nieoczekiwany błąd nie ujawnia odpowiedzi/sekretów, zachowuje zebrane rekordy. Nowy wheel w integrations/jobspy, manifest/hash i wersja lokalnego forka aktualizowane razem; obraz workera instalowany z paczki, nie checkoutu .local.

Testy offline z syntetycznym HTML i transportem kontrolowanym przez istniejący limiter obejmują R-I01–06. Osobny tester posiada wyłącznie testy/fixtures. Kontrole Python, TS, test runnera i build workera weryfikują R-I07. Pilot po buildzie maksymalnie 10 HTTP/90 s/2 s odstępu; przy 403 brak kolejnych prób. Włączenie źródła wymaga udanego pilota; przy obecnej blokadzie konfiguracja pozostaje disabled. Nie ma automatycznego fallbacku GraphQL.
