# Etap 9: Odbiór i wspólne wdrożenie — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 9 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.10`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

Zakres normatywny zachowania: [Requirements](requirements.md), E09-R01–E09-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Odbiór jest przekrojowy: WWW, worker, PostgreSQL, Ollama, OpenCode i wyszukiwarka. Wyniki umieścić w docs/specs/lokalne-ai/odbior.md dopiero po wykonaniu prób; dokument zawiera komendę/scenariusz, konfigurację bez sekretów, wynik i ograniczenia. Nie dopisywać statusów wykonania do tabeli planu zamiast aktualizacji Beads.

## Decyzja E09-D01 — Wspólny odbiór i zmiana trasowania nowych zleceń

**Decyzja techniczna:** Masowe przepisanie oczekujących operacji naruszyłoby migawki. Powrót konfiguracji jest odrębny od cofnięcia obrazu aplikacji i migracji.

Punkty integracji w obecnym katalogu: [package.json](../../../../../package.json), [worker/index.ts](../../../../../worker/index.ts), [README.md](../../../../../README.md). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Kontrakty i niezmienniki

Macierz odbioru obejmuje legacy OpenAI oraz warianty mieszane; konfiguracja działa per zastosowanie według etapu 5. Dla każdego scenariusza zapisać operation/request/attempt ID oraz session ID jeśli dotyczy, identyfikatory wersji wejść i wynik. Nie kopiować prywatnego CV do raportu odbioru.

Test migracji: kopia izolowanej bazy z reprezentatywnymi queued/submitted/unknown i terminalnymi OpenAI, uruchomienie nowych migracji, start workera, odbiór/cleanup i odczyt UI. Sprawdzić częściowe indeksy dla wszystkich nowych stanów aktywnych. Test starego obrazu aplikacji na nowych danych jest osobnym wynikiem, nie domyślną gwarancją.

W odbiorze testować kolejno profil → kilka ocen → grupa → ręczny research. Po każdym scenariuszu sprawdzić wynik i historię. Udostępnić jedno wspólne wdrożenie całego epiku z panelem, bez osobnych wydań etapów. Nie zmieniać masowo istniejących zleceń. Przy problemie wyłączyć tworzenie nowych lokalnych operacji i wskazać OpenAI dla nowych; nadal obsługiwać stare migawki. Nie cofać wykonanych migracji kasujących dane; korekty forward-only. Przywrócenie starego obrazu tylko jeśli osobny test wykazał zgodność.

Nie wykonujemy osobnego raportu ani benchmarku jakości modelu. Właściciel ocenia treść podczas normalnego używania. Raport odbioru obejmuje techniczne scenariusze API, migracji i stanów oraz jawne braki; ich niewykonanie nie może być przedstawione jako sukces.

## Migracja i uruchomienie

Zaktualizować README i .env.example zgodnie z rzeczywiście sprawdzoną instalacją: endpointy z kontenerów, wersje, dostępność modeli, izolacja i retencja OpenCode, uruchomienie/restart/anulowanie i diagnostyka. Nie pobierać modeli ani nie zmieniać globalnych ustawień właściciela w ramach samej dokumentacji. Odbiór nie upoważnia do git/Dolt push.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. pnpm check, pnpm build oraz potrzebne integracje RUN_INTEGRATION=1 na izolowanych schematach.
2. Macierz legacy/mixed/local z aktywną starą partią, zero lokalnego kosztu i płatnym narzędziem.
3. Fault injection restart, utrata lease, network, duplikaty i race anulowania/publikacji.
4. Przegląd UI i wyników technicznych; jakość treści właściciel ocenia podczas normalnego używania; wynik każdego LA-01–LA-21 z dowodem albo jawnym brakiem.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E09-AC01 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC03 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC04 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC05 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Gotowość i kontrola zmian

Specyfikacja odbioru została przejrzana. Zamknięcie zadania wymaga wyników O-L1 oraz T01–T05, wszystkich etapów i panelu; częściowy lub zablokowany wynik nie uprawnia do wydania ani zamknięcia epiku.

Przed kodem odświeżyć stan roboczy i zależności Beads. Przegląd specyfikacji wykonano 2026-11-05; nie zastępuje wyników testów ani kontroli zmian powstałych po przeglądzie.

Aktualizacja decyzji 2026-11-05: konfiguracja `.env`, bezterminowe zachowanie zebranych materiałów z wyjątkiem roboczego profilu Chrome, sprawdzanie modelu przez API bez pilota jakości oraz porcjowanie lokalnych ocen do 20 opisane są w [wymaganiach przekrojowych](../../requirements.md#doprecyzowanie-potwierdzone-2026-11-05). Próby techniczne API/sesji nie są testem jakości modelu.

Rozszerzenie z 2026-11-05: ręczne check/stop/skip w [panelu zadań](../../features/panel-zadan/requirements.md). Zachowanie zatwierdzono; normatywne szczegóły techniczne wskazują SD panelu i kontrakty runtime.

## Uzupełnienie odbioru — 2026-11-05

Do scenariuszy etapów 7/8 i panelu włączyć LA-11–LA-15: jeden agent mimo wielu workerów i restartu, retry w kolejce przy running/unknown, blokowanie kolejki podczas interwencji, ręczne idempotentne wznowienie tej samej sesji, czyste cookies dla nowego wykonania, zachowanie dowodów i uruchamianie osobnych usług. Nie rozszerza to odbioru o benchmark jakości modelu.

## Macierz odbioru po grill-me

Do raportu włączyć wyniki LA-16–21. Próba mieszana: równocześnie zlecone profil, ocena i research w kilku workerach wykonują się pojedynczo; interwencja/unknown blokuje wszystkie lokalne rodzaje. Po zmianie profilu i `.env` retry używa starej migawki i nie uruchamia się przed zwolnieniem slotu. Zła odpowiedź kończy próbę bez automatycznego drugiego wywołania. Po ręcznej naprawie usług kolejkę zwalnia potwierdzone zakończenie starej pracy, nie sam health.

Sprawdzić wyłącznie publiczne źródła: Google snippet nie uzasadnia twierdzenia, zablokowana strona powoduje próbę innych źródeł, zapytania bez danych właściciela, kategorie mogą pozostać niewiadome po próbie sprawdzenia. Brak podstaw do raportu nie zastępuje starego. Po potwierdzonym końcu można usunąć roboczy profil Chrome bez utraty materiałów i historii. Wszystkie scenariusze oraz panel są odbierane przed jednym wspólnym wdrożeniem. Funkcji logowania i parkowania z backlogu281 nie implementować w tym wydaniu.

## Warunek zakończenia epiku — przegląd 2026-11-05

Przygotować `odbior.md` **w trakcie realizacji**, z wierszem dla każdego LA-01–LA-21, PZ-01–08, E01–E09 oraz KR/T01–T05. Wiersz zawiera kryterium, scenariusz, wersje/konfigurację bez sekretów, identyfikatory testowych operacji, komendę lub odnośnik do dowodu, wynik PASS/FAIL/BLOCKED/NOT_RUN i ograniczenia. Nie wstawiać fikcyjnych PASS podczas przygotowania specyfikacji. Jeden test może pokrywać wiele kryteriów, ale każde ma odnośnik.

Macierz konfiguracji: legacy bez nowych env; lokalny profil+matching i OpenAI research; wszystkie lokalne; nieobsługiwana kombinacja/brak modelu; powrót wyboru do OpenAI przy oczekujących lokalnych i Batch. Testy wykonania mogą korzystać z atrap, lecz T01–T05/KR i połączenie tags wymagają rzeczywistych przypiętych usług. Testy techniczne protokołu nie są oceną jakości. Płatny research w macierzy testować atrapą, chyba że właściciel osobno zleci rzeczywiste płatne wywołanie.

Migracje sprawdzić na izolowanej bazie z reprezentatywnymi starymi aktywnymi rekordami i historią; fixture nie musi zawierać prywatnych danych właściciela. Test obejmuje powtórny migrate bez zmian, nowy worker, dokończenie/cleanup starych partii, nullable legacy execution, aktywne indeksy i więcej niż dwa ręczne lokalne retry. Nie edytować starych migracji. Wersję starego obrazu można cofnąć tylko po odrębnym teście zgodności; standardowo korekta forward-only i zmiana nowych zleceń.

Instrukcja operatora obejmuje: wersje i manifest, serwerowe endpointy web/worker→host, przygotowanie modelu przez właściciela, start oddzielnych usług, dostęp do prywatnego podglądu/interwencji DevTools headless Chrome w kontenerze, odmowę niedozwolonej sieci, archive/data volumes, interwencję, awarię dysku, ręczne zakończenie instancji i zapis dowodu końca unknown. Nie dodawać automatycznej naprawy ani kasowania historii. Przy cofnięciu konfiguracji zachować endpointy/sekrety starych wersji potrzebne oczekującym zleceniom.

Zadanie `334.10` i epik można zamknąć dopiero gdy wszystkie implementacje i kwalifikacja mają dowody wymaganych kryteriów, panel jest zintegrowany, a bramki techniczne przeszły. BLOCKED/NOT_RUN na obowiązkowym scenariuszu oznacza niewykonany odbiór, nawet jeśli unit tests przeszły. Wdrożenie w środowisku właściciela, commit, push i Dolt sync nadal wymagają osobnego upoważnienia; gotowy wynik do zatwierdzenia obejmuje kod, migracje, raport i odtwarzalną instrukcję.
