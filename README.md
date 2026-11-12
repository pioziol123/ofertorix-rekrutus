# Oferty pracy

Prywatne narzędzie do ofert pracy. Działa lokalny setup Nuxt/TypeScript/Nuxt UI, PostgreSQL i osobny worker pg-boss oraz import ofert PHP Senior z SOLID.Jobs. Dostępna jest lista i szczegóły pobranych ofert z filtrowaniem. Dostępne są również profil zawodowy, oceny ofert, profile firm i ręczny research podstawowy.

## Uruchomienie

Wymagany działający Docker z Compose v2. Narzędzia aplikacji działają w kontenerach; nie trzeba globalnie aktualizować Node ani pnpm. Lokalne Node służy tylko do wygenerowania pliku konfiguracyjnego:

```sh
node scripts/setup-env.mjs
docker compose up --build -d --wait
```

Otwórz [aplikację lokalną](http://127.0.0.1:3100). `WEB_PORT` w `.env` zmienia port hosta. `.env` jest lokalny, ignorowany przez Git; generator nie nadpisuje istniejącego pliku. Nie zmieniaj hasła istniejącej bazy przez samą edycję `.env` — inicjalizacyjne zmienne PostgreSQL dotyczą nowego wolumenu.

Compose uruchamia `db`, jednorazowe `migrate`, `web` oraz `worker`. WWW i worker czekają na migracje, a migracje na gotową bazę. PostgreSQL nie publikuje portu na hoście. WWW jest dostępne wyłącznie na loopback. Zmiany źródeł Nuxt są widoczne bez przebudowy; po zmianie workera wykonaj `docker compose restart worker`.

Strona /offers pokazuje dane importera, bez integracji AI. Zgodnie z decyzją właściciela aplikacja działa bez logowania; prywatny dostęp zapewnia loopback (na przyszłym VPS tunel SSH). Ten setup nie jest wdrożeniem VPS ani docelową konfiguracją produkcyjną.

## Pobieranie ofert

Worker pobiera dział IT z filtrami `Developer`, `PHP`, `Senior` według klasyfikacji SOLID.Jobs. Nie dodaje ograniczeń wynagrodzenia ani lokalizacji. Zachowuje dane źródła, w tym brakujące/nieznane wartości, linki i HTML jako dane do późniejszej bezpiecznej prezentacji. Import nie korzysta z AI.

```sh
# Ręczne zlecenie, opcjonalnie oczekiwanie do 2 minut
docker compose run --rm tools pnpm source:sync --wait
# Ostatni przebieg i ostatnia pełna synchronizacja
docker compose run --rm tools pnpm source:status
# Konkretny przebieg
docker compose run --rm tools pnpm source:status <run-uuid>
```

Komenda bez `--wait` zwraca od razu identyfikator przebiegu. Równoczesne zlecenia zwracają ten sam aktywny przebieg. `--wait` kończy się kodem 1 przy błędzie/częściowym wyniku, 2 gdy upłynie czas oczekiwania; zadanie nadal może działać. Status zawiera liczbę stron, unikalnych wpisów i nowych rewizji oraz bezpieczną przyczynę błędu.

Domyślny import codziennie o **08:00 Europe/Warsaw**. Zmienna `SOURCE_SYNC_TIME=HH:mm` w `.env` zmienia godzinę; zastosuj przez `docker compose up -d --force-recreate worker`. Worker sprawdza zaległość przy starcie i co minutę. Po kilku dniach przerwy tworzy jeden import. Ręczny import również pokrywa aktualny termin harmonogramu. Nieudany przebieg nie tworzy pętli automatycznych zleceń tego samego dnia; można go ponowić ręcznie. Pojedyncze żądanie API ma jedno ponowienie błędu sieci/429/5xx, ograniczony timeout i odstęp żądań.

Baza przechowuje ogłoszenia źródłowe (`source_ads`), kolejne zmienione payloady (`source_ad_revisions`), wersje zakresu i historię przebiegów. Identyczny import nie tworzy nowych rewizji. Po błędzie zachowujemy poprawnie zapisane strony. Tylko pełny import tego samego zakresu może oznaczyć brakującą ofertę jako niedostępną; częściowy nie zmienia dostępności niewidzianych wpisów. `valid_to` źródła pozostaje osobną informacją od dostępności. Żaden z tych stanów nie oznacza zakończenia procesu rekrutacji.

Importer wykrywa zmiany liczników i duplikaty między stronami, ale API nie gwarantuje atomowego obrazu wielu stron. Przerwanie workera pozostawia zapisane dane; po zwolnieniu blokady kolejny worker oznacza porzucony przebieg jako częściowy/nieudany. Gdy zakończy się także dostarczenie zadania kolejki, można zlecić nowy import. Lista i panel szczegółów korzystają z lokalnego API; dawnych treści na razie nie wyświetlamy.

## Przeglądanie ofert

[Lista ofert](http://127.0.0.1:3100/offers) otwiera się bez logowania. Tabela, panel aktualnych szczegółów i daty historii zmian korzystają z PostgreSQL. Filtry i wybór oferty zapisują się w URL; nie zmieniają zakresu importu ani profilu zawodowego. Dostępne są wyszukiwanie, technologie any/all/excluded i wymagane/opcjonalne, lokalizacja/tryb, kontrakt, wymiar pracy, seniority, dostępność i płaca. Sortowanie obejmuje datę wykrycia/publikacji, tytuł i firmę; strona ma 20 pozycji.

Filtr minimum płacy wymaga waluty i okresu; sprawdza górną granicę zgodnego wariantu i oznacza częściowe pokrycie. Nie przelicza walut, brutto/netto ani okresów. Oferty z nieznanymi widełkami domyślnie zostają w wynikach; można je ukryć. Inne jawne filtry wybierają znane pasujące wartości. Opis źródłowy prezentujemy jako tekst. Nazwy firm ze źródeł pozostają odrębne od profili firm: przypisanie publikującego, pracodawcy lub klienta wymaga jawnego potwierdzenia przy ofercie.

## Polecenia developerskie

```sh
docker compose run --rm tools pnpm check
docker compose run --rm tools pnpm format:check
docker compose run --rm tools pnpm build
docker compose run --rm tools pnpm smoke
docker compose run --rm -e RUN_INTEGRATION=1 tools pnpm test
docker compose logs --tail=100 web worker migrate
docker compose down
```

`check` uruchamia ESLint, kontrolę typów Nuxt i workera oraz Vitest. Testy integracyjne wymagają działających `web` i `worker` (`up --wait` wcześniej); `smoke` zleca zadanie, które oddzielny worker zapisuje w PostgreSQL. Powstające rekordy `system_checks` są technicznym potwierdzeniem, nie danymi ofert.

Health: `/api/health/live` sprawdza działanie HTTP, `/api/health/ready` dostęp do zmigrowanej bazy. Health workera sprawdza jego zapisany heartbeat; test zadania kolejki dodatkowo sprawdza wykonanie pracy.

Formatowanie: `docker compose run --rm tools pnpm format`. Dokumentacja projektowa i pliki narzędzi agentowych są wyłączone z formatowania/lintowania aplikacji.

## Zależności i migracje

Wersje bazowe: Node 24.15.0, pnpm 10.34.9, PostgreSQL 18.6. Zależności JS rozstrzyga `pnpm-lock.yaml`; build używa `--frozen-lockfile`. Node na hoście może mieć inną wersję, bo cały zestaw narzędzi uruchamia Compose.

Po zmianie `package.json` aktualizuj lockfile i zależności w kontenerze, następnie przebuduj obraz. Wolumen `dependencies` przechowuje zależności developerskie; po przebudowie uruchom `docker compose run --rm tools pnpm install --frozen-lockfile` przed uruchomieniem usług z nowymi zależnościami. Nie usuwaj przy tym wolumenu bazy.

Migracje aplikacji prowadzi `node-pg-migrate`, a jednorazowa usługa inicjalizuje też schemat pg-boss. WWW/worker nie uruchamiają równoległych migratorów. Nie stosujemy ORM ani migracji cofających, które kasują dane setupu.

## Trwałość i bezpieczeństwo

`database` jest nazwanym wolumenem PostgreSQL, `dependencies` osobnym wolumenem narzędzi. Zwykłe `docker compose down` i odtworzenie kontenerów zachowują dane. Nie używaj opcji usuwającej wolumeny do codziennego restartu.

Kopie zapasowe wykonuje zewnętrzna usługa; aplikacja nie zawiera mechanizmu backupów. Zachowanie wolumenu po restarcie nie jest backupem. Autostart po zalogowaniu zależy od ustawienia runtime Docker na Macu; `restart: unless-stopped` nie uruchamia samego Dockera ani usług jawnie zatrzymanych przez `compose down`.

Nie zapisuj sekretów w kodzie, obrazach, dokumentacji i publicznej konfiguracji Nuxt. `docker compose config` może wypisać rozwinięte sekrety — nie wklejaj jego pełnego wyniku do raportów.

## Dokumentacja projektu

[Architektura w modelu C4](docs/architecture/README.md) obejmuje kontekst systemu, kontenery, komponenty i kod przygotowania propozycji profilu.

[PRD i szkice funkcjonalności](docs/specs/pierwsza-wersja/README.md). Requirements i solution-design dopracowujemy przed konkretną funkcjonalnością. Dla bieżącego setupu właściciel wybrał krótki zakres w Beads zamiast dodatkowej pary dokumentów. Kolejność: setup → pobieranie → lista → kolejne funkcjonalności.

## Profil zawodowy

[Profil](http://127.0.0.1:3100/profile) pozwala ręcznie uzupełnić doświadczenie, umiejętności, kierunek i oczekiwania. Zapis szkicu nie aktywuje zmian; zatwierdzenie tworzy zachowaną wersję. Braki pozostają niewiadomymi. Jedno minimum płacy dotyczy jednego kontraktu.

PDF z tekstem lub DOCX do 10 MiB odczytuje lokalny worker (PDF do 30 stron). Można też wkleić tekst. Oryginały pozostają w nazwanym wolumenie `documents`, poza publicznym katalogiem; zewnętrzny backup powinien obejmować ten wolumen i bazę. Nie ma OCR. Import nie zmienia samoczynnie profilu ani preferencji.

AI jest domyślnie nieaktywne. `OPENAI_API_KEY` i `AI_PROFILE_PRICING_JSON` są wyłącznie serwerowe; sam klucz nie wystarcza. Konfiguracja JSON wymaga model, version, inputUsdPerMillion, outputUsdPerMillion, usdPln, fxVersion, maxInputTokens oraz maxOutputTokens. Kwoty podaje się jako teksty dziesiętne; limity tokenów jako liczby. Stawki muszą obejmować najdroższy dopuszczony wariant, a maxInputTokens pełen kontekst rzeczywiście używanego modelu. Nie dodawaj przykładowych niskich stawek do realnej konfiguracji.

Lokalny profil ma osobną konfigurację `AI_PROFILE_EXECUTION_JSON` i rejestr adresów `AI_ENDPOINTS_JSON`. Przykład dla `gpt-oss:20b` jest zakomentowany w [.env.example](.env.example). Wybierz okno kontekstu dla swojej instancji i zachowaj starsze wersje adresów, dopóki korzystają z nich oczekujące zlecenia. Połączenie z kontenera i model sprawdź przez listę modeli przed włączeniem lokalnej ścieżki. Pusta lub wadliwa konfiguracja daje błąd, a brak zmiennej zachowuje obsługę OpenAI. [API listy modeli Ollamy](https://docs.ollama.com/api/tags)

Utrata połączenia podczas lokalnej generacji pozostawia slot zajęty, dopóki koniec pracy nie zostanie potwierdzony. Obsługa tego stanu przez operatora i polecenia panelu są częścią odbioru całego epiku. [Kontrakty runtime](docs/specs/lokalne-ai/kontrakty-runtime.md)

Kontrolowana próba prawdziwego API z fikcyjnym CV przeszła 2026-11-01: GPT-6 Luna, poprawny schemat i dowody z tekstu, rozliczenie usage. AI uruchomiono lokalnie po weryfikacji konfiguracji. Testy automatyczne nadal używają odpowiedzi kontrolnych, bez płatnych wywołań. Wspólny limit to 100 PLN miesięcznie w Europe/Warsaw; nieznany koszt pozostaje zarezerwowany i jest uwzględniony w budżecie widocznym w profilu. Rozliczenie z usage jest konserwatywnym szacunkiem księgowym. Ręczne wyjaśnianie nieznanych kosztów odłożono decyzją właściciela do osobnego zadania `oferty-pracy-qld`; nie blokuje korzystania z AI.

Po zmianie klucza lub konfiguracji w `.env` odtwórz procesy: `docker compose up -d --no-deps --force-recreate web worker`. Samo zapisanie pliku nie aktualizuje środowiska działających kontenerów. Import CV korzysta z bezpośredniego Responses API; Batch API jest przewidziane dla przyszłych ocen i dopasowań ofert.

Testy HTTP profilu wymagają świeżego `pnpm build`; uruchamiają własny serwer, schematy i katalog plików, bez modyfikowania profilu użytkownika.

## Integracja JobSpy (wyłączona domyślnie)

Worker zawiera przypiętą paczkę forka, zależności Pythona oraz osobną kolejkę ręcznych importów Indeed. Nie ma automatycznego harmonogramu JobSpy. `JOBSPY_ENABLED=false` blokuje zlecanie i wykonanie pobierania; włączenie wymaga `JOBSPY_ENABLED=true` w `.env` i odtworzenia usług web i worker.

Status: `docker compose exec worker pnpm jobspy:status` albo GET `/api/sources/jobspy`. Po aktywacji ręczny import uruchamia `docker compose exec worker pnpm jobspy:sync --wait`. Indeed używa GraphQL i współdzielonego limitu z LinkedIn. Ograniczenie liczby wyników oznacza niepełny przebieg; CLI zwraca wtedy kod 1 mimo zapisu poprawnych ofert. Stan JobSpy jest odrębny od importu SOLID.Jobs. Oferty zachowują pochodzenie płacy; szacunki nie potwierdzają spełnienia minimum finansowego, a brak ogłoszenia w ograniczonym zapytaniu nie zmienia jego dostępności.

Kod i dokładna wersja: [manifest paczki](integrations/jobspy/manifest.json). [Instrukcja utrzymania](integrations/jobspy/README.md), [projekt integracji](docs/specs/jobspy/features/integracja-aplikacji/solution-design.md), [projekt importu Indeed](docs/specs/jobspy/features/indeed-graphql/solution-design.md).

## Himalayas — ręczny pilot

```sh
docker compose exec -T worker pnpm himalayas:sync
```

Bezpośrednie API TypeScript, bez klucza i bez JobSpy/Python. Polecenie czeka na zakończenie i wypisuje identyfikator, status, liczniki oraz diagnostykę zapisanego przebiegu. Kod wyjścia 1 oznacza błąd lub niepełny import. Import obejmuje zapytanie PHP/Senior/PL, maksymalnie 5 stron po 20 kandydatów. Brak harmonogramu, kolejki i automatycznych ponowień w tym pilocie; ponowny przebieg uruchamia się ręcznie. Równoległy import jest odrzucany przed odczytem portalu. Przerwany przebieg jest rozliczany przy kolejnym ręcznym uruchomieniu.

Ogłoszenia są widoczne na wspólnej liście ze źródłem **Himalayas**, niezmienionym linkiem źródłowym i ostrzeżeniem o niepotwierdzonej kwalifikacji PHP/senior. Wyszukiwarka obejmuje też przypadkowe wzmianki w opisach. Nie utożsamiamy jej wyników z dopasowaniem profilu. Data aktualizacji źródła nie udaje publikacji, płace nie otrzymują zgadywanego kontraktu ani podstawy. Zniknięcie z wyszukiwania nie zamyka zapisanej oferty. Pilot nie uruchamia AI.

[Zakres i rozwiązanie pilota](docs/specs/jobspy/features/himalayas/requirements.md). Źródło wymaga atrybucji i użycia `applicationLink`; nie służy do dalszego publikowania bazy w innych agregatorach.

## Polskie serwisy: Bulldogjob, theprotocol.it, Just Join IT, No Fluff Jobs

Cztery źródła są dostępne w `/offers` w sekcji „Polskie serwisy — pobieranie ofert”. Podaj technologię i poziom, następnie wybierz „Pobierz oferty” przy źródle. Import jest ręczny; jego kryteria nie zmieniają filtrów przeglądania zapisanych ofert. Formularz rozpoczyna od PHP/Senior, ale można podać np. Go albo pozostawić technologię i poziom puste. Brak danych o spełnieniu kryterium nie odrzuca oferty i jest komunikowany w szczegółach. Jawnie inny znany poziom jest pomijany.

Connectory używają istniejącego w obrazie workera Python/curl_cffi, profilu Chrome i HTTP/2. Nie wymagają cookies użytkownika ani logowania. Bulldogjob i theprotocol korzystają z HTML i osadzonego `__NEXT_DATA__`. Just Join IT korzysta z JSON API z kursorem, a No Fluff Jobs z POST wyszukiwania i JSON szczegółów. W NFJ wyłączono salary-match i respektujemy zadeklarowane strony zamiast zakładać, że rozmiar strony wynosi 20. Są niezależne od kontraktu forka JobSpy. Płace, kontrakty, opisy, technologie i surowe rekordy listy/szczegółu trafiają do wspólnego modelu oraz historii rewizji. Bulldogjob nie oznacza tagów jako obowiązkowe; theprotocol zachowuje podział wymagane/opcjonalne.

```sh
# Po aktualizacji działającego środowiska: utworzenie nowych kolejek i restart
# Przy czystym docker compose up --build wykonuje to już usługa migrate.
docker compose exec worker pnpm exec tsx scripts/init-queue.ts
docker compose up -d --no-deps worker web

# Ręczne importy; all oznacza brak danego kryterium
docker compose exec worker pnpm polish:sync --source bulldogjob --technology PHP --seniority senior --wait
docker compose exec worker pnpm polish:sync --source theprotocol --technology Go --seniority all --wait
docker compose exec worker pnpm polish:sync --source justjoinit --technology PHP --seniority senior --wait
docker compose exec worker pnpm polish:sync --source nofluffjobs --technology PHP --seniority senior --wait
docker compose exec worker pnpm polish:status
docker compose exec worker pnpm polish:status bulldogjob <run-uuid>

# Offline: parsery/transport z syntetycznymi próbkami, bez żądań do portali
docker compose exec worker /opt/jobspy/bin/python -m unittest discover -s tests -p 'test_polish*.py'
```

Domyślny przebieg ma limit 50 ofert, 5 stron, 60 żądań i 150 sekund. CLI pozwala zmienić `--max-offers` (1–200), `--max-pages` (1–100) i `--max-requests` (1–250). Nadal obowiązuje limit czasu. Żądania do każdego źródła są rozdzielone co najmniej 2 sekundami; nie ma ukrytych redirectów, ponowień, proxy ani solverów. Identyfikator szczegółu musi zgadzać się z listą, a adres należy do konkretnego portalu. Odpowiedź HTML jest ograniczona do 8 MiB, zapisany pakiet rekordów do 6 MiB, a proces do 180 s.

Osiągnięcie limitu, zmiana paginacji, challenge/403/429, błędny rekord lub brak opisu skutkują niepełnym przebiegiem. Poprawnie pobrane rekordy są zachowywane, a nieobecne oferty **nie są automatycznie oznaczane jako niedostępne**, także po pustym wyniku. Nie gwarantujemy atomowego snapshotu portalu ani pokrycia rynku. Równoczesne zlecenia dla tego samego źródła zwracają aktywny przebieg, nawet jeżeli mają inne kryteria — po jego zakończeniu można rozpocząć nowy. Restart odzyskuje stan porzuconych zadań.

`POLISH_SOURCES=bulldogjob,theprotocol,justjoinit,nofluffjobs` włącza ręczne przyciski i CLI czterech źródeł; `POLISH_SOURCES=none` je wyłącza. Nie dodano harmonogramu. Żądanie aplikacji to `POST /api/sources/polish` z JSON zgodnym z formularzem, status to `GET /api/sources/polish`; POST wymaga tego samego Origin co aplikacja. Bezpośredni proces Python nie otrzymuje kluczy AI, hasła bazy ani konfiguracji proxy aplikacji.

Just Join IT wyszukuje technologię przez `skills`, `keywords` i `keywordType=skill`; nie ograniczamy jej do jednej głównej kategorii. Dla obsługiwanych poziomów źródło dostaje `experienceLevels`; pozostałe są sprawdzane lokalnie. Kursor pochodzi z `meta.next.cursor`, a przy osiągnięciu obserwowanej granicy 10000 wynik pozostaje niepełny. Nie przedstawiamy przeliczeń walut źródła jako kolejnych kontraktów: normalizowane są tylko płace `currencySource=original`, wszystkie warianty pozostają w raw.

NFJ identyfikuje regionalne warianty tej samej publikacji przez zgodne `reference` listy i szczegółu, a przy braku tego dowodu wymaga zgodności ID (bez różnicy wielkości liter). Zapisuje kanoniczny `defaultUrl` i pobiera szczegół raz dla danej publikacji. Liczniki paginacji nadal dotyczą regionalnych kart, nie liczby zapisanych ofert. Zachowuje musts/nices, oryginalne zakresy płac per kontrakt i raw. Znacznik `posted` odczytujemy jako milisekundy; data wygaśnięcia bez strefy pozostaje w raw, a znormalizowana data pozostaje niewiadomą. Nazwa technologii lub poziom nie są wyprowadzane z samego tytułu. Nieznany poziom nie odrzuca oferty.

### Oceny ofert przez Batch API

W szczegółach oferty sekcja „Dopasowanie do profilu” pozwala zlecić ocenę na podstawie zatwierdzonej wersji profilu. Widać rating, oddzielną kompletność, cztery składowe, dowody oraz historię. Wynik dla starszego profilu/ogłoszenia pozostaje w historii z oznaczeniem nieaktualności. Ten etap nie uruchamia ocen automatycznie ani researchu.

Ustaw `AI_MATCHING_PRICING_JSON` w `.env` i odtwórz usługi web/worker. Format jak `AI_PROFILE_PRICING_JSON`: `model`, `version`, `inputUsdPerMillion`, `outputUsdPerMillion`, `usdPln`, `fxVersion`, `maxInputTokens`, `maxOutputTokens`. Stawki muszą być cenami **Batch** dla wybranego modelu, a `version` identyfikuje ich migawkę. Nie używaj niezweryfikowanego cennika CV. Kwoty i kurs zapisuj jako tekst dziesiętny. Brak konfiguracji wyłącza zlecanie; nie zmienia konfiguracji CV. Limit wejścia jest konserwatywnie kontrolowany liczbą bajtów UTF-8 całego żądania, w tym instrukcji i schematu.

Po migracji `pnpm migrate` tworzy kolejkę `offer-matching`. Worker odtwarza dostarczenie co minutę. Zlecenie zużywa wspólny budżet AI, czeka na środki i może oczekiwać na wynik Batch do24h. Nie przełącza się na Responses w trybie natychmiastowym. Ocena z przycisku w szczegółach tworzy osobną partię; zaznaczone na liście oferty tworzą wspólną partię z osobnymi wynikami i rozliczeniem.

Niepewny stan utworzenia partii ma status „Wysyłka lub koszt wymagają sprawdzenia” i zachowuje rezerwację; brak automatycznej ponownej wysyłki. Zidentyfikowane partie można sprawdzić w panelu dostawcy. Po zakończonym odbiorze pliki są usuwane; błędy sprzątania ponawiane. Nie usuwamy pliku przy nieznanym wyniku utworzenia potencjalnie aktywnej partii: wejście ma48h retencji dostawcy; pliki wynikowe7dni. W takim przypadku należy ustalić zdalny stan przed nowym zleceniem, które może wygenerować kolejny koszt.

Wymagania konieczne bez jednoznacznych danych są do sprawdzenia. Kontrola lokalna porównuje znany tryb pracy i pełne warianty płac (waluta/okres/umowa/podstawa). Tekstowe wykluczenia i pozostałe wymagania nie otrzymują zgadywanego potwierdzenia. Sama ocena AI nie zastępuje ich weryfikacji.

Na żądanie właściciela pełną treść partii zachowujemy lokalnie w PostgreSQL (`matching_batch_artifacts`, migracja12): dokładny wysłany JSONL, surowe pliki wyników i błędów, kolejne metadane Batch oraz sumy SHA-256. Wejście zapisujemy przed uploadem, wszystkie dostępne pliki wynikowe przed parsowaniem i sprzątaniem zdalnym. Błąd zapisu archiwum podczas odbioru pozostawia pliki do ponownego odczytu, bez ponownego płatnego zlecenia. Archiwum zawiera zawodowe dane profilu i pełną odpowiedź modelu; nie zawiera klucza API ani nagłówków autoryzacji. Nie trafia do logów ani repozytorium i nie ma automatycznego terminu usunięcia.

W szczegółach oferty → „Historia zleceń AI” → „Pobierz archiwum całej partii (JSON)” pobierzesz lokalne artefakty; w grupie jest to pełna partia wszystkich objętych nią ofert. Pobranie nie odpytuje OpenAI. Dla starych lub jeszcze niewysłanych zleceń pole `reconstructedInput` może zawierać wejście odtworzone z zapisanych żądań; nie udaje ono oryginalnego pliku. Usuniętych wcześniej wyników nie odtwarzamy. W trakcie pracy archiwum zawiera tylko dotychczas otrzymane artefakty.

Na liście kolumna „Dopasowanie” pokazuje rating, kompletność, składowe i aktualność oraz stan ostatniego zlecenia. W „Więcej filtrów” można ustawić minimalny rating, kompletność i cztery składowe, a także stan oceny. Sortowanie „Najlepsze dopasowanie” pokazuje aktualne znane oceny przed nieaktualnymi i bez ratingu. Progi nie traktują niewiadomych jak zera; nieaktualne wyniki przechodzą je tylko po jawnym wybraniu stanu „Nieaktualna ocena”.

Zaznaczenie nagłówka dotyczy bieżącej strony. Można zachować wybór przy przejściu na następną stronę; zmiana filtrów czyści zaznaczenie. Limit100ofert i2MiBplikuJSONL. „Oceń zaznaczone” pokazuje łączną maksymalną rezerwację. Oferty już oczekujące są wykorzystywane ponownie, wykluczone lokalnie nie generują kosztu. Przy niewystarczającym budżecie cała nowa grupa czeka bez częściowej rezerwacji. Identyfikator komendy chroni przed ponownym zleceniem po utracie odpowiedziHTTP; ponowne kliknięcie z niezmienionym wyborem odczytuje istniejące zlecenie.

Migracja8 tworzy `matching_groups` oraz kolejkę `offer-matching-group`; po migracji uruchom ponownie worker. Testy korzystają z podstawionego transportu, bez płatnych analiz.

## Firmy i research podstawowy

W zakładce `/companies` można tworzyć profile organizacji, marek i firm o nieustalonej tożsamości. W szczegółach ogłoszenia wybierz „Przypisz lub utwórz profil firmy”, a następnie rolę i uzasadnienie. Zgodna nazwa/domena nie scala profili. Technologie z ofert są pokazane oddzielnie od ustaleń researchu.

Na profilu firmy przycisk „Uruchom research podstawowy” zleca zebranie źródeł i syntezę. Raport obejmuje działalność, projekty, metody pracy, technologie i ryzyka. Ustalenia mają typ, zakres oraz klikalne źródła i daty. Wyszukiwane deklaracje nie stanowią automatycznego potwierdzenia stanu faktycznego. Bez źródeł model powinien wskazać niewiadomą. Raport jest własną syntezą; nie zapisujemy pełnych stron ani cytatów wydawców.

`AI_RESEARCH_PRICING_JSON` ma format konfiguracji profilu, ale używa cen **standardowych**, nie Batch. Startowo `gpt-6-luna`, maksymalne wejście co najmniej 500000 i wyjście 4000–6000 tokenów, `reasoning:low`; model porównawczy `gpt-4.1-mini` wymaga co najmniej 100000 wejścia. Rezerwacja wspólnego miesięcznego budżetu obejmuje dwa przebiegi i trzy wyszukiwania po 0.01 USD. UI pokazuje limit przed zleceniem. Konfigurację i klucz czyta tylko serwer; zmiana `.env` wymaga odtworzenia web/worker. Przykład w `.env.example` jest migawką cen, wymagającą aktualizacji wraz z cennikiem.

Gotowy raport jest używany ponownie bez TTL. „Odśwież research — nowy koszt” tworzy nową wersję, poprzednie pozostają do wglądu. Równoczesne zlecenia nie dublują kosztu. Brak budżetu daje stan oczekiwania. Niepewne przerwanie zachowuje rezerwację i wymaga uwagi; płatna próba nie jest ponawiana automatycznie. Błąd nie usuwa poprzedniego raportu. Progi automatycznego uruchamiania oraz research pogłębiony pozostają kolejnymi etapami.
