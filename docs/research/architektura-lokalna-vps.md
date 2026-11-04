# Prosta architektura lokalna z drogą na VPS

Data weryfikacji: 2026-10-30. Research do decyzji „Wykonalność prostej architektury lokalnej z drogą na VPS” (`bd show oferty-pracy-v4t.3`).

## Wniosek roboczy

Oba poniższe warianty są wykonalne. Najprostszy punkt odniesienia to **monolit Django z szablonami HTML, SQLite i osobnym procesem Huey**, uzupełniony trwałym rejestrem operacji i odzyskiwaniem przerwanej pracy. Nie potrzeba osobnej aplikacji SPA, Redis ani serwera bazy na start. **SvelteKit + PostgreSQL + pg-boss** jest sensowną alternatywą, zwłaszcza przy większej znajomości TypeScriptu i chęci korzystania z mechanizmów kolejki opartych na tej samej bazie.

To rekomendacja do dalszego porównania, nie wybór architektury. Model domeny, kontrakty AI, dokładna polityka wznowień i potrzeby interakcji UI pozostają otwarte. Badanie opiera się na dokumentacji; nie instalowano komponentów ani nie wykonywano prototypu, testów wydajności lub migracji.

## Założenia produktu

Zgodnie z [ustaleniami](../product/ustalenia.md): jeden właściciel, aplikacja w przeglądarce, pierwsze uruchomienie na macOS, późniejsza możliwość przeniesienia aplikacji i danych na VPS. Pobieranie i triage domyślnie raz dziennie oraz na żądanie; research i przygotowanie do rozmowy mogą trwać długo. Historia, oczekujące operacje i budżet muszą przetrwać restart. Dostęp ma być prywatny, a kopie automatyczne. Robocze 100 zł miesięcznie dotyczy AI i researchu, osobno od ewentualnego VPS; nie oznacza zgody na zakup.

## Dwa warianty

Poniższa tabela przedstawia propozycje projektowe i ich ocenę utrzymaniową, a nie wyniki pomiarów.

| Obszar | A: Python / Django / SQLite / Huey | B: TypeScript / SvelteKit / PostgreSQL / pg-boss |
| --- | --- | --- |
| UI | Szablony serwera i formularze; niewielki JavaScript do stanu operacji i wygodniejszych filtrów | SvelteKit ze stronami serwera i interaktywnymi komponentami |
| Dane | SQLite na lokalnym dysku; oddzielny plik kolejki Huey | PostgreSQL: dane aplikacji i tabele pg-boss |
| Procesy podczas normalnej pracy | Serwer WWW oraz jeden consumer Huey z harmonogramem | Serwer Node, worker Node z harmonogramem oraz PostgreSQL |
| Retry i restart | Retry Huey + obowiązkowy rejestr operacji i rekoncyliacja po awarii | Retry, heartbeat i wygaśnięcie aktywnej pracy w pg-boss + trwały stan domenowy |
| Instalacja macOS | Python, środowisko wirtualne, zależności; bez usługi serwera bazy | Node i zależności oraz lokalny PostgreSQL lub środowisko kontenerowe |
| Przenosiny na VPS | Ta sama aplikacja i spójne kopie SQLite; nadal jeden host | Ten sam build, PostgreSQL i odtworzenie dumpa; bez zmiany silnika bazy |
| Koszt obsługi | Mniej usług, ale trzeba jawnie obsłużyć odzyskanie pracy Huey | Więcej usług, za to więcej gotowych mechanizmów niezawodności kolejki |
| Kiedy ma przewagę | Priorytetem jest mała liczba elementów i prosty UI | TypeScript jest wygodniejszy dla utrzymującego lub interakcje UI są istotnie bogatsze |

### A. Zweryfikowane możliwości i ograniczenia

Django obejmuje ORM, migracje, widoki, szablony i panel administracyjny. Daje to podstawę jednej aplikacji bez osobnego backendu i frontendowego API. Panel administracyjny może pomagać w obsłudze danych; docelowe widoki ofert, firm i rekrutacji nadal trzeba zaprojektować. [Dokumentacja Django](https://docs.djangoproject.com/en/5.2/intro/overview/).

Huey udostępnia `SqliteHuey`, zadania okresowe i retry z opóźnieniem. Consumer wykonuje zadania oraz sprawdza harmonogram. Przy wielu consumerach tylko jeden powinien dodawać zadania okresowe. **Trwała kolejka nie gwarantuje odzyskania zadania już wykonywanego:** dokumentacja ostrzega, że nagłe zabicie procesu lub utrata zasilania może takie zadanie zgubić. Sygnał przy kontrolowanym zamknięciu nie zastępuje odzyskiwania po awarii hosta. [Huey: guide](https://huey.readthedocs.io/en/stable/guide.html), [consumer](https://huey.readthedocs.io/en/stable/consumer.html).

Rekomendacja: pojedynczy worker na początek, trwałe operacje w bazie domenowej, a Huey jako mechanizm ich uruchamiania. Jeśli zapis operacji i wysłanie do kolejki są w różnych plikach SQLite, nie ma jednej transakcji obejmującej oba zapisy. Najpierw zapisać zamiar w bazie, następnie wysłać identyfikator; okresowy przegląd niewysłanych/przerwanych operacji naprawia lukę po restarcie. Nie tworzyć własnego ogólnego frameworka kolejki.

Wbudowane Tasks w Django 6.0 nie rozwiązują tego samodzielnie: framework definiuje kontrakt zadania, lecz nie dostarcza wykonującego workera; wbudowane backendy służą rozwojowi i testom. Nie są zamiennikiem trwałej infrastruktury pracy. [Django Tasks](https://docs.djangoproject.com/en/6.0/topics/tasks/).

### B. Zweryfikowane możliwości i ograniczenia

Oficjalny `adapter-node` SvelteKit generuje samodzielny serwer Node. Umożliwia konfigurację adresu i portu; aplikacja może więc działać lokalnie i na własnym VPS. To cel wdrożenia, nie usługa zarządzająca workerem czy bazą. [SvelteKit: Node servers](https://svelte.dev/docs/kit/adapter-node).

pg-boss działa na Node i PostgreSQL, korzysta z `SKIP LOCKED` do pobierania pracy przez wielu wykonawców oraz obsługuje retry i harmonogram. Dokumentacja pozwala utworzyć zadanie we wspólnej transakcji z operacją aplikacji, co upraszcza spójne zlecanie pracy. Redis nie jest potrzebny. [Repozytorium pg-boss](https://github.com/timgit/pg-boss).

Opcje zadań obejmują limit prób, opóźnienie i backoff, heartbeat oraz limit czasu aktywnej próby. Brak heartbeat może spowodować retry. Domyślny limit aktywności to 15 minut, a retencja oczekujących zadań jest ograniczona, więc konfiguracja musi odpowiadać długim operacjom i możliwej dłuższej przerwie w pracy komputera. [pg-boss: Jobs](https://pgboss.io/api/jobs).

Rekomendacja: worker jako osobny proces tego samego projektu; mała współbieżność i wspólna transakcja zapisu operacji/zlecenia. Nadal nie oznacza to dokładnie jednego płatnego wywołania AI: awaria między otrzymaniem odpowiedzi od dostawcy a zapisaniem wyniku może prowadzić do ponowienia.

## Baza: współbieżność, backup i przenoszenie

### Fakty z dokumentacji

SQLite w WAL umożliwia równoczesne odczyty i zapis, ale ma tylko jednego zapisującego naraz. Wszystkie procesy korzystające z WAL muszą być na tym samym hoście; nie należy trzymać aktywnej bazy na sieciowym systemie plików. Długie odczyty mogą utrudniać checkpoint i powiększać WAL. Plik WAL jest częścią stanu bazy, więc kopiowanie samego aktywnego `.db` nie stanowi poprawnego backupu. Aktualna dokumentacja opisuje też poprawkę błędu WAL-reset: użyć SQLite 3.51.3 lub nowszego albo wskazanego wydania z backportem; sprawdzić bibliotekę faktycznie używaną przez runtime, nie wyłącznie polecenie systemowe. [SQLite WAL](https://www.sqlite.org/wal.html).

SQLite Online Backup API tworzy spójną kopię działającej bazy; alternatywą jest `VACUUM INTO`. [SQLite Backup API](https://www.sqlite.org/backup.html). Django ostrzega, że zwiększenie timeoutu blokady daje dłuższe oczekiwanie, ale nie rozwiązuje nadmiernej współbieżności zapisów. [Django: database is locked](https://docs.djangoproject.com/en/5.2/ref/databases/#database-is-locked-errors).

PostgreSQL korzysta z MVCC oraz blokad wierszy i tabel; równoczesne odczyty i zapisy są częścią jego modelu, ale konflikty zapisów nadal wymagają poprawnego projektowania transakcji. [PostgreSQL: MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html). `pg_dump` tworzy spójny eksport przy działającej bazie; obejmuje jedną bazę, a role i inne obiekty globalne wymagają osobnej obsługi. Dokumentacja zastrzega, że poza prostymi przypadkami sam dump nie jest odpowiednią strategią regularnych kopii produkcyjnych. [PostgreSQL: pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

### Zalecenia dla tego produktu

- SQLite jest realnym wariantem również na pojedynczym VPS. Samo przeniesienie z macOS na Linux nie wymusza PostgreSQL. Nie otwierać tej samej bazy jednocześnie z Maca i VPS przez udział sieciowy lub synchronizowany katalog.
- Operacje sieciowe i AI wykonywać poza transakcją; pobierać/zapisywać stan w krótkich transakcjach. Ograniczyć jednoczesne zapisy i obsłużyć przejściowe blokady.
- Przejście na PostgreSQL rozważyć przy trwałych konfliktach zapisów mimo krótkich transakcji, potrzebie wielu workerów/hostów lub wyborze pg-boss. Nie uzależniać tego wyłącznie od liczby ofert.
- Automatyczny backup: spójny snapshot SQLite albo — dla tej małej instalacji — dump PostgreSQL, osobno załączniki, wersja schematu i instrukcja odtworzenia. Kopia poza dyskiem roboczym, szyfrowanie i retencja; miejsce pozostaje do ustalenia. Test odtworzenia jest konieczny. Backup dwóch plików SQLite nie jest wspólnym snapshotem: rejestr domenowy musi umożliwiać odbudowę kolejki.
- Migracja hosta: zatrzymać tworzenie nowych zleceń, zakończyć lub oznaczyć aktywne próby, wykonać spójną kopię i backup plików, odtworzyć na VPS, uruchomić migracje właściwe dla wersji aplikacji, sprawdzić dane i rekoncyliację. Uruchomić harmonogram tylko na nowym hoście. Migracja SQLite → PostgreSQL byłaby osobną migracją danych i wymaga testu; zmiana konfiguracji ORM nie przenosi rekordów.

## Restart, harmonogram i długie AI

Poniższy kontrakt jest rekomendacją wspólną dla obu wariantów, do doprecyzowania po ustaleniu domeny i integracji AI:

1. HTTP zapisuje operację i od razu zwraca jej identyfikator. UI odczytuje postęp; zamknięcie karty nie przerywa pracy.
2. Rejestr przechowuje stan, etap, liczbę prób, najwcześniejsze wznowienie, błąd, identyfikator próby oraz termin ważności zajęcia/heartbeat. Worker nie trzyma transakcji podczas oczekiwania na AI.
3. Po awarii zadanie oczekujące pozostaje zleceniem, a porzucone `running` jest rozpoznawane po wygaśnięciu zajęcia. Stara próba nie może nadpisać wyniku nowszej. Każdy etap ma klucz deduplikacji i zapisane wyniki pośrednie.
4. Retry ma limit, backoff i rozróżnia błędy przejściowe, trwałe oraz wstrzymanie przez budżet. Przed płatną próbą atomowo rezerwować budżet; przy nieznanym wyniku wywołania nie zwalniać rezerwacji bez sprawdzenia. Wykorzystywać idempotency key/identyfikator zlecenia dostawcy, jeśli kontrakt usługi go wspiera. Nie obiecywać odzyskania stosu wywołań ani dokładnie jednokrotnego naliczenia opłaty.
5. Po starcie i okresowo sprawdzać ostatnie ukończone pobranie. Jeśli termin minął, dodać jedno zaległe uruchomienie, zamiast odtwarzać każde pominięte tyknięcie. Unikalny klucz cyklu zapobiega duplikatom między ręcznym i automatycznym startem. Strefa harmonogramu: jawnie ustalona, np. `Europe/Warsaw`; momenty zdarzeń przechowywane w UTC.

Harmonogram w bibliotece nie wykonuje pracy na wyłączonym lub uśpionym komputerze. Huey sprawdza zadania okresowe przez działającego consumera. pg-boss również wymaga działającej instancji; jego dokumentacja opisuje politykę zaległych terminów (`skip` albo `once`), którą trzeba dobrać jawnie i sprawdzić dla przypiętej wersji. [Huey consumer](https://huey.readthedocs.io/en/stable/consumer.html), [pg-boss Scheduling](https://pgboss.io/api/scheduling).

Rekomendacja operacyjna: na macOS jeden sposób uruchomienia WWW i workera, następnie nadzór przez `launchd`; na VPS usługi `systemd` z restartem po błędzie, logami i startem po restarcie systemu. Nie dodawać drugiego niezależnego harmonogramu tej samej operacji. Apple dokumentuje `launchd` do zadań czasowych, a systemd obsługuje polityki `Restart=`. [Apple: Scheduling Timed Jobs — dokumentacja archiwalna](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html), [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). Szczegóły konfiguracji bieżącego macOS wymagają sprawdzenia przy wdrożeniu. Użytkownik powinien widzieć ostatnie udane pobranie i opóźnienie harmonogramu.

## Dostęp prywatny, sekrety i środowisko

Rekomendacja minimum: lokalnie nasłuch na `127.0.0.1`, jedno konto właściciela, ochrona sesji i CSRF. Na VPS również loopback oraz dostęp przez tunel SSH; nie wystawiać portów aplikacji i bazy publicznie. Przykładowy mechanizm: `ssh -N -L 127.0.0.1:8000:127.0.0.1:8000 użytkownik@vps`, następnie przeglądarka lokalna. OpenSSH dokumentuje szyfrowane przekazywanie portów oraz jawne związanie lokalnego portu z loopback. [OpenSSH ssh(1)](https://man.openbsd.org/ssh). Tunel wymaga uruchomienia i autoryzacji SSH; łatwiejszy dostęp z wielu urządzeń może uzasadnić prywatny VPN lub HTTPS z uwierzytelnieniem, co jest osobną decyzją wdrożeniową.

Klucze AI i hasła przechowywać wyłącznie po stronie serwera: plik konfiguracyjny poza repozytorium z prawami dla właściciela procesu lub magazyn sekretów systemu. Repo zawiera tylko przykład bez wartości. Nie włączać sekretów do danych kolejki, kodu klienta, logów ani zwykłych kopii diagnostycznych. Backup danych traktować jako prywatny, ponieważ zawiera profil i kontakty rekrutacyjne; sposób odzyskania sekretów opisać oddzielnie. Django zaleca ochronę `SECRET_KEY`, konfigurację przez środowisko/plik, wyłączenie `DEBUG` i weryfikację ustawień wdrożenia. [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/).

Oba warianty można uruchamiać natywnie bez Dockera. Kontenery są opcją późniejszego pakowania, nie warunkiem przenoszenia danych. Na macOS wymagają odpowiedniego runtime, np. zainstalowanego i działającego Docker Desktop, z odrębnymi wymaganiami sprzętowymi/systemowymi; nie zakładać zgodności i dostępności na komputerze właściciela bez sprawdzenia. [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/). Obrazy i zależności muszą obsługiwać architekturę docelowego VPS; trwałe dane nie mogą żyć wyłącznie w warstwie kontenera.

## Co pozostaje przed wyborem

Decyzja architektoniczna powinna potwierdzić znajomość języka przez właściciela, wymagania interakcji UI, model operacji i wznowień AI, maksymalny czas etapu, politykę budżetową, akceptowane opóźnienie po uśpieniu oraz cel i retencję kopii. Najmniejszym uzasadnionym punktem startowym pozostaje wariant A; wariant B ma przewagę, jeżeli niższy koszt własnej implementacji niezawodnej kolejki i preferencja TypeScriptu równoważą obsługę PostgreSQL. Żaden wariant nie wymaga obecnie osobnej platformy orkiestracji, wielu hostów ani usług płatnych do samego działania aplikacji.
