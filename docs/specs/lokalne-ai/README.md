# Refaktor AI, Ollama i lokalny agent — plan wdrożenia

Status: **pakiet specyfikacji do pracy etapowej**, aktualizacja 2026-11-05. Decyzje produktowe opisane w wymaganiach są zatwierdzone; projekt techniczny i plan weryfikacji służą wykonawcy. Bieżąca praca obejmuje dokumentację, bez implementacji i uruchamiania usług.

**Aktualizacja decyzji właściciela:** lokalny model to `gpt-oss:20b`, a runtime agenta to OpenCode. Bez narzuconych przez aplikację limitów korzystania z Ollamy (budżetu, tokenów, wywołań i rund). Własna pętla agenta oraz wcześniejsza propozycja limitowania lokalnej pracy są zastąpione tym wyborem. Obsługa błędów, anulowania i restartu pozostaje częścią integracji.

- [PRD — cel, zakres i rezultaty dla właściciela](PRD.md).
- [Wymagania przekrojowe i kryteria LA-01–LA-21](requirements.md).
- [Granice modułów i projekt przekrojowy](solution-design.md).
- [Istniejąca architektura projektu](../pierwsza-wersja/architecture.md).
- [Kontrakty runtime: sesje, kolejka, Chrome, archiwum i komendy](kontrakty-runtime.md).
- [Przekazanie lokalnemu modelowi: wejście, etapy i walidacja](przekazanie-lokalnemu-modelowi.md).
- [Kwalifikacja przypiętych wersji i izolacji Chrome](kwalifikacja-runtime.md).

Specyfikacja utrzymuje zakres i decyzje. **Beads jest jedynym źródłem statusu, przypisań i zależności**: `bd show oferty-pracy-334`. Kolejność poniżej to plan techniczny; nie lista wykonanych prac. Gotowość każdego zadania oceniamy osobno po przeglądzie i dopracowaniu jego pary requirements/SD. Etykieta `ready-for-agent` oznacza przygotowanie specyfikacji; nie oznacza wykonania zadania ani spełnienia jego zależności implementacyjnych.

## Cel i zasady przejścia

Profil i oceny mają korzystać z lokalnego modelu bez klucza OpenAI. Research podstawowy ma uzyskać alternatywne wykonanie przez agenta z modelem lokalnym i narzędziami wyszukiwania oraz odczytu stron. Dotychczasowe OpenAI, Batch, historia i wspólny budżet pozostają obsługiwane.

Najpierw oddzielamy istniejące odpowiedzialności bez zmiany zachowania. Następnie dodajemy drugi adapter modelu i lokalne wykonanie, a później integrujemy agenta OpenCode. Pętlę agenta realizuje OpenCode. Profil można technicznie sprawdzić wcześniej, ale właściciel otrzyma jedno wspólne wdrożenie całego epiku, wraz z panelem.

Przed każdym etapem przeczytać aktualny kod i zastane zmiany oraz odświeżyć jego przejrzane requirements/SD względem wyników poprzednika. Gotowość specyfikacji zapisano w Beads po przeglądzie; nie powtarzać formalnie całego przygotowania bez nowej rozbieżności. Uzyskać decyzję dla materialnej zmiany zachowania. Przy implementacji zachowania użyć `implement-with-tester`. Nie wykonujemy commitu, push ani synchronizacji Dolt w ramach samego planu.

## Requirements i SD każdego etapu

Pary przygotowane 2026-11-04 zostały przejrzane i dopracowane 2026-11-05 w zadaniach 334.19/20. Krytyczne kontrakty doprecyzowano w SD i wspólnym runtime. Wybrano headless Chrome w kontenerze z ręcznym podglądem DevTools; zadanie kwalifikacji wersji/izolacji wskazano poniżej i blokuje etap 7 do uzyskania dowodów. Weryfikacja techniczna pozostaje pracą wykonawcy, nie wykonanym wynikiem dokumentacji.

| Etap | Requirements | Solution design |
| --- | --- | --- |
| 1. Wspólna konfiguracja i budżet | [Requirements](etapy/01-konfiguracja-budzet/requirements.md) | [SD](etapy/01-konfiguracja-budzet/solution-design.md) |
| 2. Profil niezależny od protokołu OpenAI | [Requirements](etapy/02-profil-adapter/requirements.md) | [SD](etapy/02-profil-adapter/solution-design.md) |
| 3. Oceny oddzielone od OpenAI Batch | [Requirements](etapy/03-oceny-batch/requirements.md) | [SD](etapy/03-oceny-batch/solution-design.md) |
| 4. Research niezależny od wykonawcy OpenAI | [Requirements](etapy/04-research-wykonawca/requirements.md) | [SD](etapy/04-research-wykonawca/solution-design.md) |
| 5. Ollama gpt-oss:20b i lokalny profil | [Requirements](etapy/05-ollama-profil/requirements.md) | [SD](etapy/05-ollama-profil/solution-design.md) |
| 6. Lokalne oceny pojedyncze i zbiorcze | [Requirements](etapy/06-ollama-oceny/requirements.md) | [SD](etapy/06-ollama-oceny/solution-design.md) |
| 7. Wyszukiwanie i odczyt stron dla OpenCode | [Requirements](etapy/07-narzedzia-www/requirements.md) | [SD](etapy/07-narzedzia-www/solution-design.md) |
| 8. OpenCode jako agent researchu z gpt-oss:20b | [Requirements](etapy/08-opencode/requirements.md) | [SD](etapy/08-opencode/solution-design.md) |
| 9. Odbiór i wspólne wdrożenie | [Requirements](etapy/09-odbior/requirements.md) | [SD](etapy/09-odbior/solution-design.md) |

## Etapy

| Etap | Wynik | Zależności | Pokrycie | Beads |
| --- | --- | --- | --- | --- |
| 1 | Wspólna konfiguracja i budżet poza modułem profilu | Przegląd pierwszego SD | LA-02, fundament LA-03/06 | `oferty-pracy-334.2` |
| 2 | Profil oddzielony od protokołu OpenAI | 1 | LA-02/03, fundament LA-04 | `oferty-pracy-334.3` |
| 3 | Oceny oddzielone od cyklu OpenAI Batch | 1 | LA-02/03, fundament LA-05 | `oferty-pracy-334.4` |
| 4 | Research oddzielony od obecnego wykonawcy OpenAI | 1 | LA-02/03, fundament LA-07 | `oferty-pracy-334.5` |
| 5 | Adapter Ollamy, profil z gpt-oss:20b i sprawdzenie dostępności modelu | 2; sprawdzenie wybranego modelu | LA-01/03/04/06/08 | `oferty-pracy-334.6` |
| 6 | Lokalne oceny pojedyncze i zbiorcze | 3, 5 | LA-01/05/06/08/10 | `oferty-pracy-334.7` |
| 7 | Wybrane źródło wyszukiwania i kontrolowane narzędzia WWW | 5 — wykonania i wspólny slot; kwalifikacja 334.21; T03–T05 przed live | LA-07/09/12/13 | `oferty-pracy-334.8` |
| 8 | OpenCode z gpt-oss:20b jako agent researchu | 4, 5, 7; kontrakt sesji i recovery | LA-01/03/06/07/08/09/11/14/15 | `oferty-pracy-334.9` |
| 9 | Odbiór mieszanej instalacji i wspólne wdrożenie | 6, 8, panel | LA-01–LA-21, PZ-01–08 | `oferty-pracy-334.10` |

Numeracja wyznacza zalecaną kolejność pracy. Etapy 2, 3 i 4 mogą być wykonywane po 1 niezależnie od siebie. Etap 7 wymaga kwalifikacji 334.21 i fundamentu wykonań/kolejki/slotu z etapu 5; samo rozpoznanie protokołu i izolowane testy Chrome można przygotować wcześniej. To zależności techniczne, nie polecenie równoległej edycji tych samych plików.

### Etap 1 — wydzielić konfigurację i budżet

Z `lib/profile/ai.ts` przenieść wspólne funkcje do `lib/ai/`, przełączyć konsumentów w ocenach i researchu. Szczegóły: [Requirements etapu 1](etapy/01-konfiguracja-budzet/requirements.md) i [SD etapu 1](etapy/01-konfiguracja-budzet/solution-design.md).

Zakończenie: identyczne obliczenia i zachowanie rezerwacji, stare konfiguracje nadal obsługiwane, brak migracji i nowych płatnych wywołań. Weryfikacja: jednostkowe ceny/konfiguracja oraz istniejące testy PG profilu, ocen i researchu. Przegląd pary z 2026-11-05 doprecyzował wewnętrzną arytmetykę, konsumenta w liście ofert i transakcję wywołującego reserve; szczegóły i kryteria E01-AC01–04 utrzymuje SD etapu 1.

### Etap 2 — oddzielić profil od wywołania dostawcy

W profilu pozostawić przygotowanie wejścia, instrukcje, schemat i `checkProposal`. Wydzielić pojedyncze wywołanie OpenAI do adaptera modelu. Zachować obecne retry, limity i sposób zatwierdzania profilu; nie przenosić reguł CV do transportu.

Zakończenie: wykonanie profilu zależy od małego interfejsu modelu, testy mogą dostarczyć odpowiedź bez HTTP. OpenAI zachowuje zgodne żądanie i rozliczenie. Testy obejmują odmowę, obcięcie, błędny JSON, brak cytatu, błąd sieci i brak telemetrii. W tym etapie zdefiniować neutralne komunikaty, wynik i zdolności wymagane do odpowiedzi strukturalnej. Nie przenosić do tego interfejsu zarządzania sesjami OpenCode.

### Etap 3 — oddzielić ocenę od OpenAI Batch

Rozdzielić budowanie zadania oceny i jego walidację od upload/create/poll/results/cleanup w `matching/batch.ts`, `store.ts`, `groups.ts`. Wyodrębnić wspólną publikację poprawnego wyniku. Grupa zleceń i partia dostawcy mają odrębne znaczenia.

Zakończenie: dotychczasowe partie pojedyncze i grupowe nadal można wysyłać, odczytywać, archiwizować i sprzątać. Zachowane custom_id, idempotencja komend, atomowe finansowanie, aktualność i publikacja rewizji. Testy: wyniki poza kolejnością, częściowy błąd, przerwanie przed/po utworzeniu partii, powtórne dostarczenie i starsza wersja wejścia. Bez lokalnego wykonawcy w tym etapie.

### Etap 4 — oddzielić research od obecnego wykonawcy

W module firm zachować cel, wersje raportu, reuse/refresh i walidację dowodów. Wykonawcę OpenAI z wbudowanym wyszukiwaniem utrzymać jako działającą całość za kontraktem wykonania researchu. Oddzielić pozyskany materiał dowodowy, syntezę i finalną walidację tam, gdzie pomaga to drugiemu wykonawcy; nie zastępować działającego wyszukiwania fikcyjnym ogólnym adapterem.

Zakończenie: obecny ręczny research podstawowy zachowuje dwa wywołania, koszty i kontrakt źródeł. Testy: brak źródeł, błędne cytaty/URL, błąd syntezy po płatnym wyszukiwaniu, restart i zachowanie poprzedniego raportu. Research pogłębiony i progi automatyczne pozostają poza zakresem.

### Etap 5 — dodać Ollamę i uruchomić lokalny profil

Rozszerzyć konfigurację o jawnego dostawcę i sposób wykonania, z obsługą starych migawek jako OpenAI. Dodać natywny adapter Ollamy, wyjście strukturalne i rozpoznawanie niepełnej odpowiedzi. Zapis migawki nie obejmuje sekretów. Dodać do `.env.example`, Compose i README konfigurację dla WWW i workera oraz kontrolę dostępności modelu.

Najpierw testy HTTP offline. Sprawdzić połączenie z workera i obecność skonfigurowanego gpt-oss:20b przez GET /api/tags, bez automatycznego pobierania. Nie wykonujemy osobnego pilota jakości modelu; właściciel oceni wynik podczas normalnego używania. Nie narzucać kwot inferencji; współbieżność wszystkich lokalnych prac wynosi 1 ze względu na zasoby. Obsługa kontekstu, anulowania i błędów pozostaje częścią integracji.

Zakończenie: profil przez Ollamę działa bez klucza/cennika OpenAI; koszt API zero, nieznane tokeny pozostają nieznane, wyczerpany płatny budżet nie blokuje lokalnej propozycji. Model niedostępny lub zbyt mały kontekst daje kontrolowany błąd; nigdy ciche ucięcie wejścia lub fallback. To pierwszy działający fragment wewnętrzny, nie osobne wydanie.

### Etap 6 — uruchomić lokalne oceny

Dodać lokalnego wykonawcę zadania z etapu 3, używając adaptera z etapu 5. Zlecenie zbiorcze zachowuje komendę i wyniki per pozycja; praca jest porcjowana z trwałym postępem, bez tworzenia plików OpenAI. Uzupełnić wymagania i SD dopasowania o lokalny wariant oraz UI o dostawcę/model i właściwe statusy.

Zakończenie: pojedyncze i grupowe lokalne oceny przez `gpt-oss:20b` przechodzą te same kontrole dowodów i aktualności. Restart nie powtarza ukończonych pozycji. Współistnieją stare partie OpenAI i nowe lokalne zlecenia; zmiana ustawień nie przepisuje ich wykonawcy. Testy obejmują brak kwot lokalnej pracy, brak podwójnego wykonania oraz brak blokowania bezpłatnej synchronizacji źródeł.

### Etap 7 — wybrać wyszukiwanie i zbudować narzędzia

Wybrano Google przez dedykowany headless Chrome w kontenerze i Chrome DevTools MCP; podgląd/input właściciela przez prywatny DevTools. Zbudować kontrolowany most przekazujący gotowe operacje przeglądarkowe i zapisujący odczyty przed podaniem modelowi. Nie implementować własnego silnika przeglądarki ani wyszukiwarki. Publiczne strony bez logowania, czysty profil per wykonanie, interwencja i wznowienie w tym samym stanie. Dowody rozróżniają search snippet i odczytaną stronę, zachowują tekst oraz pochodzenie.

Zakończenie: E07-AC01–06 i T03–T05 z [kontraktów runtime](kontrakty-runtime.md). Test izolacji obejmuje cały ruch Chrome, nie tylko parametr URL. Same dokumenty lub konfiguracja proxy nie są dowodem spełnienia ochrony. Brak kwot rund/tokenów/czasu całego agenta.

### Etap 8 — zintegrować OpenCode jako agenta researchu

Wybrano headless HTTP OpenCode jako osobną lokalną usługę. Adapter i trwały dziennik żądań wiążą wykonanie z sesją i wiadomościami; aplikacja nie prowadzi drugiej pętli agenta. Globalna kolejka FIFO dopuszcza jedną lokalną pracę AI; unknown, cancelling i interwencja zajmują slot. Jawne retry zapisuje nowe wykonanie, lecz jego start czeka na potwierdzone zakończenie poprzedniego. Końcowy raport waliduje moduł firm na dowodach konkretnego wykonania.

Zakończenie: E08-AC01–06 i T01/T02, zgodność z etapem 7 oraz komendami panelu. Wersje, sesje, restart, abort, wynik, izolacja i retencja wymagają dowodów technicznych. Interwencję można testować bez gotowego UI, więc panel nie blokuje samej implementacji kontraktu wykonawcy.

### Etap 9 — odebrać całość i wdrożyć wspólnie

Podczas odbioru sprawdzić kolejno lokalny profil, kilka ręcznych ocen, grupę i ręczny research; udostępnić je dopiero jako jedno wydanie z panelem. Nie przełączać automatycznie całej bazy i nie uruchamiać masowej ponownej oceny. Sprawdzić warianty mieszane: lokalny profil/oceny i OpenAI research oraz wszystkie trzy zastosowania lokalnie z jawnym źródłem wyszukiwania.

Zakończenie: pełne `pnpm check`, potrzebne integracje PostgreSQL/API na izolowanych schematach, build i kontrola UI. Osobna próba migracji na kopii ze starymi oczekującymi partiami, ponowne uruchomienie workera i kontrola rozliczeń. Powrót do OpenAI dla nowych zadań działa bez kasowania historii. Jakość odpowiedzi właściciel ocenia w normalnym użyciu; osobny benchmark nie jest warunkiem wdrożenia.

## Kolejność wynikająca z zależności

Beads przechowuje blokady, nie kolejność wyświetlania po ID lub dacie aktualizacji. Po audycie grafu 2026-11-05:

| Zadanie wykonawcze | Wymagane wcześniejsze zadania |
| --- | --- |
| Etap1 — `334.2` | Brak wcześniejszego etapu implementacyjnego. |
| Etap2 — `334.3` | Etap1 (`334.2`). |
| Etap3 — `334.4` | Etap1 (`334.2`). |
| Etap4 — `334.5` | Etap1 (`334.2`). |
| Etap5 — `334.6` | Etap2 (`334.3`); etap1 jest zależnością pośrednią. |
| Etap6 — `334.7` | Etapy3 i5 (`334.4`, `334.6`). |
| Kwalifikacja runtime — `334.21` | Niezależna od refaktorów; wybrany headless w kontenerze, próby bez danych właściciela. |
| Etap7 — `334.8` | Etap5 (`334.6`): trwałe wykonania i wspólny slot; kwalifikacja (`334.21`). |
| Etap8 — `334.9` | Etapy4,5,7 (`334.5`, `334.6`, `334.8`). |
| Panel — `334.15` | Etapy6 i8 (`334.7`, `334.9`). |
| Odbiór i wspólne wdrożenie — `334.10` | Etapy6 i8 oraz panel (`334.7`, `334.9`, `334.15`). |

Pełny prefiks ID: `oferty-pracy-`. Dla jednego wykonawcy zalecana kolejność pozostaje 1 → 2 → 3 → 4 → 5 → 6 → kwalifikacja 334.21 → 7 → 8 → panel → 9. Graf pozostawia niezależne prace bez sztucznych wzajemnych blokad. Można go wyświetlić przez `bd list --parent oferty-pracy-334 --deps`.

Backlog `oferty-pracy-281` wymaga ukończenia odbioru `334.10`, ale nie jest dzieckiem obecnego epiku i nie jest blockerem wydania. Zamknięte zadania planowania/specyfikacji nie oznaczają ukończenia etapów implementacyjnych.

## Warunki akceptacji planu i otwarte wybory

O-L4: przegląd specyfikacji wykonano i wynik zapisano w parach. Przed kodem odświeżyć zmiany powstałe po przeglądzie. Sposób izolacji headless Chrome opisuje kwalifikacja runtime; jej testy są pracą wykonawcy. Model (`gpt-oss:20b`), runtime agenta (OpenCode) i brak kwot Ollamy są ustalone. Przed włączeniem etapu 5 sprawdzamy dostępność modelu przez API; przed włączeniem 7/8 wyniki bramek technicznych T01–T05. Źródło wyszukiwania i zachowanie sesji są wybrane. Te kwestie nie blokują przygotowania pierwszego refaktoru. Nie ustalamy terminów kalendarzowych bez pomiaru wybranego zestawu i sprawdzenia wyszukiwania.

Nie ma nowych testów ani zmian kodu w ramach tego dokumentu. Weryfikacja planu obejmuje odnośniki, pokrycie kryteriów etapami, zależności Beads i zachowanie zgodności opisanych kontraktów. Wynik planowania nie jest dowodem działania Ollamy lub agenta.

Aktualizacja decyzji 2026-11-05: konfiguracja `.env`, bezterminowe zachowanie zebranych materiałów z wyjątkiem roboczego profilu Chrome, sprawdzanie modelu przez API bez pilota jakości oraz porcjowanie lokalnych ocen do 20 opisane są w [wymaganiach przekrojowych](requirements.md#doprecyzowanie-potwierdzone-2026-11-05). Próby techniczne API/sesji nie są testem jakości modelu.

## Rozszerzenie: panel zarządzania zadaniami

Zlecone 2026-11-05: [Requirements](features/panel-zadan/requirements.md), [SD](features/panel-zadan/solution-design.md), Beads `oferty-pracy-334.15`. Panel obejmie sprawdzenie, zatrzymanie, pominięcie, retry i wznowienie; zachowanie jest zatwierdzone, kontrakt opisany w SD panelu i kontraktach runtime. Specyfikację panelu dopracowano po przeglądzie; realizacja wymaga ukończenia etapów 6/8. Nie jest to ukończona funkcja. Przed odbiorem etapu 9 należy uwzględnić przyjęty zakres panelu. Google przez przeglądarkę jest potwierdzonym kierunkiem etapu 7.

Potwierdzona decyzja 2026-11-05: OpenCode steruje dedykowanym Google Chrome przez **Chrome DevTools MCP** (`chrome-devtools-mcp`). Playwright MCP nie wchodzi do wybranej integracji. Szczegóły: [SD etapu 7](etapy/07-narzedzia-www/solution-design.md). Wybór nie oznacza uruchomienia implementacji ani instalacji usług.

## Ostatnie rozstrzygnięcia — 2026-11-05

Potwierdzono wspólną kolejkę z jedną lokalną pracą AI ze względu na zasoby (profil, pojedyncze oceny, research) oraz reguły cookies, archiwum dowodów, osobnych usług i ręcznego wznowienia. Kanoniczne kryteria: LA-11–LA-15 w [wymaganiach](requirements.md). Retry może powstać od razu, ale jego start czeka na potwierdzone zakończenie poprzedniego agenta. To aktualizacja specyfikacji, bez rozpoczęcia implementacji.

## Zamknięty wywiad grill-me — 2026-11-05

Q1–Q13 i wspólne podsumowanie zatwierdzone. Kryteria LA-16–LA-21 uzupełniają LA-11/13. Wszystkie lokalne prace używają wspólnego slotu od etapu 5; cały epik wdrażamy razem. Retry kopiuje stare wejście i konfigurację, po błędnej odpowiedzi decyzja o nowej generacji jest ręczna. Publiczne źródła bez logowania, Google tylko do wyszukiwania, bez danych właściciela w zapytaniach. Profil Chrome jest usuwalny po końcu i archiwizacji materiałów. Infrastruktura pozostaje odpowiedzialnością operatora. Logowanie i parkowanie sesji: backlog `oferty-pracy-281`, poza bieżącym wydaniem.

## Wejście po przeglądzie wykonawczym

Zacznij od `oferty-pracy-334.2`. Kolejne zadania realizuj po spełnieniu blockerów z Beads, w zalecanej kolejności etapów. Kwalifikacja `334.21` dostarcza przypięty zestaw i dowody izolacji przed 7/8; headless Chrome w kontenerze z prywatnym DevTools jest wybranym projektem, a jego kwalifikacja wymaga rzeczywistych dowodów. Dokładne zmiany i testy określa SD danego etapu.

Przygotowanie nie uruchomiło testów aplikacji ani usług. Wykonano przegląd aktualnego kodu oraz dokumentów; wyniki kontroli spójności i zależności zapisuje `334.20`. Odbiór, publikacja i uruchomienie w środowisku właściciela pozostają odrębnymi działaniami.
