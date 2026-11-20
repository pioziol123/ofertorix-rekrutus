# Architektura kolejek i workerów: jak robią to inni (inspiracje dla epiku 2ba)

Zebrane 2026-11-20 dla epiku `oferty-pracy-2ba` (biblioteka kolejek i worker na pg-boss). Opis stanu z dnia zebrania.

**Metoda.**

- **pg-boss:** wnioski pochodzą z kodu źródłowego wersji 12.38.0 zainstalowanej w projekcie. Pliki: `plans.js`, `manager.js`, `attorney.js` i `types.d.ts` w katalogu `dist` paczki.
- **Pozostałe systemy:** wnioski pochodzą z oficjalnej dokumentacji czytanej 2026-11-20. Adres strony stoi przy każdym twierdzeniu.
- **Oznaczenia:**
  - „(wniosek)” oznacza wywód z przytoczonych źródeł;
  - „nie podano” oznacza, że przeczytana strona tego nie mówi.

Pierwsza wersja tego pliku była napisana z pamięci modelu, bez czytania źródeł. Ta wersja ją zastępuje.

## 1. pg-boss 12.38: co już mamy pod ręką

Sprawdzone w kodzie źródłowym:

- **Ostateczna porażka zawsze trafia do kolejki nieudanych zadań, także po awarii workera.**
  - Wszystkie drogi porażki przechodzą przez jedną procedurę, `failJobsBody`:
    - porażka zgłoszona przez worker (`failJobsById`);
    - przekroczenie limitu czasu stwierdzone przez nadzorcę (`failJobsByTimeout`, z komunikatem „job timed out”);
    - utrata sygnału życia (`failJobsByHeartbeat`, z komunikatem „job heartbeat timeout”).
  - Procedura wstawia kopię zadania do kolejki wskazanej w `dead_letter`, gdy zadanie przechodzi w stan `failed`, czyli gdy nie ma już podejść. Kopia niesie oryginalne dane zadania (`data`) oraz nazwę i identyfikator zadania źródłowego (`source_name`, `source_id`).
- **pg-boss ma własny sygnał życia zadania.** Ustawienie kolejki `heartbeatSeconds` sprawia, że nadzorca oznacza zadanie jako nieudane, gdy nie było odświeżenia (`touch`) przez tyle sekund. Do tego czasu nie trzeba czekać na limit czasu zadania. Worker pg-boss sam odświeża sygnał co `heartbeatSeconds / 2` (`manager.js`, `#processJobs`).
- **Nadzorca działa domyślnie** w każdej instancji pg-boss (`supervise` domyślnie `true`, `attorney.js`).
- **Porażka „bez ponawiania”.** Wynik zadania `deadletter` (typ `JobResultStatus`, tryb `perJobResults`) kończy zadanie od razu i przenosi je do kolejki nieudanych zadań, bez pozostałych podejść (`deadLetterJobsByIdWithOutputs`, `forceTerminal`).
- **Rosnący odstęp z górnym limitem.** Ustawienie `retryDelayMax` ogranicza czas oczekiwania przy `retryBackoff` (opis wzoru w `types.d.ts`).
- **Kilku ustawień nie da się zmienić później.** `updateQueue` nie zmienia ustawień `policy`, `deadLetter`, `retryDelayMax` ani `heartbeatSeconds` (typ `UpdateQueueOptions`).

**Wniosek dla nas.** Luka z punktu 22 zrzutu da się zamknąć jednym mechanizmem pg-boss, bez okresowego sprawdzania. Luka polega na tym, że worker padł w ostatnim podejściu, a obsługa niepowodzenia się nie uruchamia. Rozwiązanie:

1. Każda kolejka dostaje swoją kolejkę nieudanych zadań.
2. Worker obsługuje ją jak każdą inną kolejkę, a jej obsługą jest obsługa niepowodzenia modułu.

Ograniczenie: kolejkę nieudanych zadań trzeba ustawić przy tworzeniu kolejki, bo później nie da się jej dodać. Właśnie zakładamy nowe kolejki, więc to dobry moment.

## 2. Porównanie według tematów

### Ostateczna porażka i awaria procesu

| System | Co się dzieje |
| --- | --- |
| Sidekiq | Po wyczerpaniu ponowień uruchamia `sidekiq_retries_exhausted` oraz globalne `death_handlers`, a zadanie przenosi do zbioru Dead. Gdy proces padnie, wykonywane zadania „will be lost” przy podstawowym pobieraniu ([Error-Handling](https://github.com/sidekiq/sidekiq/wiki/Error-Handling)). Płatne super_fetch odzyskuje osierocone zadania. Zadanie odzyskane 3 razy w 72 godziny trafia od razu do Dead jako „poison pill” ([Reliability](https://github.com/sidekiq/sidekiq/wiki/Reliability)). |
| Oban | Lifeline przywraca zadania, które utknęły w stanie „executing”. Kryterium jest wyłącznie czas: domyślnie 1 godzina, sprawdzane co minutę. Gdy podejścia się wyczerpały, oznacza zadanie jako `discarded`. Ostrzega przed podwójnym wykonaniem ([Oban.Lifeline](https://oban.hexdocs.pm/Oban.Lifeline.html)). |
| River | Rescuer znajduje zadania „stuck”: domyślnie po 1 godzinie albo po JobTimeout plus 1 godzina. Ponawia je albo odrzuca, gdy wyczerpały podejścia ([maintenance-services](https://riverqueue.com/docs/maintenance-services)). |
| BullMQ | Zadanie bez sygnału życia jest „stalled” i wraca do kolejki. Po przekroczeniu `maxStalledCount` (domyślnie 1) kończy się trwałą porażką ([stalled](https://docs.bullmq.io/guide/jobs/stalled)). |
| Solid Queue | Zadania procesu, który przestał wysyłać sygnał życia, są oznaczane jako nieudane (`ProcessPrunedError`) i „deliberately” nie są ponawiane automatycznie. Nie mają do nich zastosowania `retry_on` ani `rescue_from` ([README](https://github.com/rails/solid_queue)). |
| Temporal | Serwer „doesn't detect failures when a Worker … crashes”. Opiera się na limicie Start-To-Close albo na sygnale życia ([detecting-activity-failures](https://docs.temporal.io/encyclopedia/detecting-activity-failures)). |
| AWS SQS | Wiadomość, której nie usunięto przed upływem visibility timeout, wraca do kolejki. Po `maxReceiveCount` odbiorach trafia do kolejki nieudanych wiadomości ([visibility](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html), [DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)). |
| Laravel | Gdy zadanie wyczerpie podejścia, wywoływana jest metoda `failed()` z `MaxAttemptsExceededException`. Strona nie mówi, jak liczone są podejścia po awarii workera ([queues](https://laravel.com/docs/12.x/queues)). |

**Wniosek.** Wszystkie systemy oparte na bazie danych wykrywają porzucone zadanie po czasie, a nie po sygnale od procesu, który padł. Różnią się tym, co robią później:

- ponawiają albo odrzucają: Oban, River, BullMQ;
- oznaczają jako nieudane i nie ponawiają: Solid Queue;
- przenoszą do kolejki nieudanych: SQS, a w pg-boss do kolejki z `deadLetter`.

Tylko kolejka nieudanych zadań daje modułowi gwarantowaną reakcję na każdą ostateczną porażkę. Tak działają pg-boss i SQS.

### Błąd „nie ponawiaj”

- **Oban:** wynik `{:cancel, reason}` „no longer retried”; `{:snooze, period}` odkłada zadanie i nie zużywa podejścia ([Oban.Worker](https://oban.hexdocs.pm/Oban.Worker.html)).
- **River:** `JobCancel` („not retried”) i `JobSnooze` ([cancelling](https://riverqueue.com/docs/cancelling-jobs), [snoozing](https://riverqueue.com/docs/snoozing-jobs)).
- **Temporal:** lista błędów, których nie ponawia, i znacznik `nonRetryable` ([retry-policies](https://docs.temporal.io/encyclopedia/retry-policies)).
- **Celery:** domyślnie żadne wyjątki nie są automatycznie ponawiane (`autoretry_for`) ([tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html)).
- **BullMQ:** własna strategia odstępu może zwrócić -1, co oznacza „nie ponawiaj” ([retrying](https://docs.bullmq.io/guide/retrying-failing-jobs)).
- **pg-boss:** wynik `deadletter` (sekcja 1).

**Wniosek.** Wszystkie przejrzane systemy z ponawianiem pozwalają obsłudze zadania powiedzieć „to nie ma sensu ponawiać”. Nasza obsługa zadania tego nie ma.

### Ponawianie i odstęp

Domyślne ustawienia:

| System | Liczba podejść | Odstęp |
| --- | --- | --- |
| Sidekiq ([Error-Handling](https://github.com/sidekiq/sidekiq/wiki/Error-Handling)) | 25 ponowień | `retry_count**4 + 15 + losowo` |
| Oban ([Worker](https://oban.hexdocs.pm/Oban.Worker.html)) | 20 | wykładniczy, co najmniej 15 s |
| River ([job-retries](https://riverqueue.com/docs/job-retries)) | 25 | `attempts^4 ± 10%` |
| Temporal ([retry-policies](https://docs.temporal.io/encyclopedia/retry-policies)) | bez limitu | 1 s × 2, do 100 s |
| Laravel ([queues](https://laravel.com/docs/12.x/queues)) | 1 („only attempt a job once”) | — |
| Celery, autoponawianie ([tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html)) | 3 | `retry_backoff=False`, czyli bez czekania |
| BullMQ ([retrying](https://docs.bullmq.io/guide/retrying-failing-jobs)) | bez `attempts` brak ponowień | bez `backoff` od razu |

**Wniosek.** Domyślne ustawienia skrajnie się różnią. Laravel, BullMQ i Celery domyślnie nie ponawiają albo nie czekają między podejściami. Systemy nastawione na niezawodność ponawiają wiele razy z rosnącym odstępem. Twoja decyzja (domyślne ustawienia pg-boss, odstęp 0, moduł ustawia sobie sam) mieści się w pierwszej grupie.

### Unikalność i wyłączność według klucza

- **Unikalność:**
  - River pilnuje jej indeksem unikalnym w bazie. Domyślnie obejmuje stany od oczekującego do zakończonego, a pomija anulowane i odrzucone ([unique-jobs](https://riverqueue.com/docs/unique-jobs)).
  - Oban mówi wprost, że jego unikalność „does not rely on unique constraints”, więc jest podatna na wyścigi ([unique_jobs](https://oban.hexdocs.pm/unique_jobs.html)).
  - Sidekiq Enterprise trzyma blokadę do sukcesu zadania, także w czasie ponawiania. Czas blokady jest obowiązkowy, „so that if a process crashes, any locks … won't last forever” ([Ent-Unique-Jobs](https://github.com/sidekiq/sidekiq/wiki/Ent-Unique-Jobs)).
  - Laravel `ShouldBeUnique` zwalnia blokadę po zakończeniu albo po ostatniej porażce, a `uniqueFor` daje limit czasu ([queues](https://laravel.com/docs/12.x/queues)).
- **Wyłączność, czyli ograniczenie równoległości:**
  - Solid Queue `limits_concurrency` ma klucz, limit `to` (domyślnie 1) i `duration` (domyślnie 3 minuty) jako „failsafe” na niezwolnioną blokadę ([README](https://github.com/rails/solid_queue)).
  - Laravel `WithoutOverlapping` może zostawić niezwolnioną blokadę, stąd `expireAfter` ([queues](https://laravel.com/docs/12.x/queues)).
  - BullMQ Pro ma limit równoległych zadań na grupę ([groups/concurrency](https://docs.bullmq.io/bullmq-pro/groups/concurrency)).

**Wniosek.** Unikalność i wyłączność to w każdym systemie dwa osobne pojęcia. Tak samo rozdzieliliśmy klucz deduplikacji i klucz wyłączności. Systemy, które trzymają blokadę poza wierszem zadania (Sidekiq, Laravel, Solid Queue), muszą dawać jej limit czasu. pg-boss trzyma blokadę w samym wierszu zadania (indeks na aktywnych zadaniach), więc zwalnia się ona razem ze zmianą stanu zadania, także po porażce stwierdzonej przez nadzorcę (wniosek z sekcji 1).

### Gdzie żyją ustawienia

- **Przy definicji zadania w kodzie:**
  - Oban: opcje workera, a liczba równoległych zadań kolejki w konfiguracji aplikacji ([Worker](https://oban.hexdocs.pm/Oban.Worker.html), [unique_jobs](https://oban.hexdocs.pm/unique_jobs.html));
  - Sidekiq: `sidekiq_options` w klasie zadania ([Ent-Unique-Jobs](https://github.com/sidekiq/sidekiq/wiki/Ent-Unique-Jobs));
  - Laravel: `$tries`, `$backoff` i `$timeout` w klasie zadania ([queues](https://laravel.com/docs/12.x/queues)).
- **Przy kolejce:**
  - SQS: visibility timeout i redrive policy ([DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html));
  - pg-boss: ustawienia kolejki, które zadanie może nadpisać.

**Wniosek.** Ustawienia, od których zależy poprawność, czyli unikalność i liczbę podejść, przejrzane biblioteki trzymają w kodzie zadania. Ustawienia eksploatacyjne, czyli ile naraz i jakie limity czasu, trzymają w konfiguracji. Nasz plik konfiguracji kolejek trzyma oba rodzaje.

### Zatrzymanie przy wdrożeniu

- **Sidekiq:** po TERM przestaje pobierać zadania i czeka do 25 s. Niedokończone zadania „pushed back to Redis” ([Signals](https://github.com/sidekiq/sidekiq/wiki/Signals)). Strony nie mówią, czy takie zadanie zużywa podejście.
- **River:** przerwane podejście „become[s] available again without consuming an attempt”. Według strony dotyczy to Ruby i Rust ([graceful-shutdown](https://riverqueue.com/docs/graceful-shutdown)).
- **Solid Queue:** przy łagodnym zatrzymaniu (QUIT) zadania wracają do kolejki. Przy KILL są oznaczane jako nieudane (`ProcessExitError`) ([README](https://github.com/rails/solid_queue)).
- **BullMQ:** zamknięcie czeka bez limitu czasu. Zadania niedokończone przed końcem procesu odzyskuje mechanizm „stalled” ([graceful-shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)).
- **Laravel:** `queue:restart` kończy workery po bieżącym zadaniu ([queues](https://laravel.com/docs/12.x/queues)).

**Wniosek.** Dwa systemy mówią wprost, że zatrzymanie przy wdrożeniu nie zużywa podejścia (River) albo oddaje zadanie do kolejki (Sidekiq, Solid Queue). U nas przerwanie przy zatrzymaniu kończy podejście porażką („shutdown”). Przy jednym podejściu każde wdrożenie w trakcie zadania kończy je ostatecznie.

### Izolacja procesów i zabijanie zadań

- **Celery:** twardy limit czasu zabija proces potomny, a obsługa zdarzenia odbywa się w procesie głównym. Przy puli prefork `on_failure` też działa w procesie głównym ([tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html)).
- **BullMQ:** zadania „sandboxed” działają w osobnym procesie, uruchamianym przez `spawn`. Strona nie mówi, co się dzieje z zadaniem po awarii procesu potomnego ([sandboxed-processors](https://docs.bullmq.io/guide/workers/sandboxed-processors)).
- **Oban:** limit czasu jest zwykłą porażką, ponawianą jak inne ([Worker](https://oban.hexdocs.pm/Oban.Worker.html)).
- **Solid Queue:** nie ma limitu czasu zadania. Zadanie, które utknęło przy żywym procesie, „can remain claimed” ([README](https://github.com/rails/solid_queue)).

**Wniosek.** Nasza pula procesów potomnych zabijanych przez proces główny to model Celery prefork. Ten sam model stosuje BullMQ w trybie sandbox.

### Zadanie bez znanej obsługi

- **Solid Queue:** zadanie, którego klasa nie istnieje, jest oznaczane jako nieudane (`ClassMissingError`) ([README](https://github.com/rails/solid_queue)).
- **Graphile Worker:** przeczytane strony tego nie podają.

**Wniosek.** Nie znalazłem źródła, które by mówiło, że któryś system celowo nie pobiera zadań nieznanego typu. Wcześniejsze twierdzenie o Graphile Worker było niesprawdzone i je wycofuję. Twoja decyzja (odrzucić od razu i zalogować) jest zgodna z tym, co robi Solid Queue.

### Wysyłanie w transakcji

- **River:** wysyłanie zadania w tej samej transakcji co zapis ([transactional-enqueueing](https://riverqueue.com/docs/transactional-enqueueing)).
- **Laravel:** `after_commit` czeka na zatwierdzenie transakcji, a przy wycofaniu zadania „will be discarded” ([queues](https://laravel.com/docs/12.x/queues)).

**Wniosek.** Wysyłanie zadania w transakcji modułu, tak jak u nas, to sprawdzona praktyka kolejek opartych na tej samej bazie danych.

### Zadania okresowe

- **Solid Queue:** plik konfiguracji z harmonogramem zadań. Ochrona przed podwójnym uruchomieniem wymaga zachowania zakończonych zadań ([README](https://github.com/rails/solid_queue)).
- **River:** prace utrzymaniowe uruchamia jeden wybrany lider ([maintenance-services](https://riverqueue.com/docs/maintenance-services)).

To dotyczy zadania „Przenieść pracę okresową do osobnego procesu”, nie biblioteki kolejek.

## 3. Wnioski dla epiku 2ba, od największego wpływu

1. **Obsługa niepowodzenia przez kolejkę nieudanych zadań pg-boss.** Ta zmiana zamyka punkt 22 zrzutu bez okresowego sprawdzania. Zmienia ustalenie dla biblioteki, że obsługa niepowodzenia rusza tylko po porażce zapisanej przez worker. Fakt potwierdzony w kodzie, sekcja 1.
2. **Sygnał życia zadania z pg-boss (`heartbeatSeconds`).** Nadzorca pg-boss wykrywa porzucone zadanie w sekundach zamiast po limicie czasu. Do rozważenia, czy zastępuje część naszego własnego pilnowania sygnału życia.
3. **Wynik „nie ponawiaj”.** Mają go wszystkie przejrzane systemy z ponawianiem, a pg-boss go obsługuje (`deadletter`).
4. **Zatrzymanie przy wdrożeniu a liczba podejść.** River nie zużywa podejścia, Sidekiq i Solid Queue oddają zadanie do kolejki, a my kończymy podejście porażką. Pytanie do właściciela.
5. **Unikalność i liczba podejść w pliku konfiguracji.** W przejrzanych bibliotekach te ustawienia żyją w kodzie zadania. Pytanie do właściciela.
6. **Zgodne z praktyką, zostaje:**
   - rozdział unikalności i wyłączności;
   - blokada w wierszu zadania;
   - wysyłanie w transakcji;
   - pula procesów zabijanych przez proces główny;
   - odrzucanie zadań bez obsługi.

## Czego nie sprawdzono

- **Sidekiq:** czy zadanie oddane przy zatrzymaniu zużywa podejście.
- **Laravel:** liczenie podejść po awarii workera.
- **Graphile Worker:** domyślna liczba podejść i to, czy pobiera zadania nieznanego typu.
- **AWS SQS:** 5-minutowe okno deduplikacji kolejek FIFO.
- **BullMQ:** `UnrecoverableError`.
- **Celery:** `worker_max_tasks_per_child`.

Przeczytane strony tego nie podają.
