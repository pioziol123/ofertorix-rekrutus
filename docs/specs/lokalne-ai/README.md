# Refaktor AI, Ollama i lokalny agent — plan wdrożenia

Status: **plan do przeglądu**, 2026-11-04. Zlecenie obejmuje planowanie, bez implementacji i uruchamiania usług. Właściciel potwierdził potrzebę lokalnych modeli i poprosił o omówienie lokalnego agenta oraz granic modułów. Szczegółowe kontrakty, konfiguracja i dobór narzędzi pozostają propozycjami.

**Aktualizacja decyzji właściciela:** lokalny model to `gpt-oss:20b`, a runtime agenta to OpenCode. Bez narzuconych przez aplikację limitów korzystania z Ollamy (budżetu, tokenów, wywołań i rund). Własna pętla agenta oraz wcześniejsza propozycja limitowania lokalnej pracy są zastąpione tym wyborem. Obsługa błędów, anulowania i restartu pozostaje częścią integracji.

- [PRD — cel, zakres i rezultaty dla właściciela](PRD.md).
- [Wymagania przekrojowe i kryteria LA-01–LA-10](requirements.md).
- [Granice modułów i projekt przekrojowy](solution-design.md).
- [Istniejąca architektura projektu](../pierwsza-wersja/architecture.md).

Specyfikacja utrzymuje zakres i decyzje. **Beads jest jedynym źródłem statusu, przypisań i zależności**: `bd show oferty-pracy-334`. Kolejność poniżej to plan techniczny; nie lista wykonanych prac. Zadania są szkicami bez `ready-for-agent`; przed ich realizacją obowiązuje przegląd i dopracowanie właściwej pary requirements/SD.

## Cel i zasady przejścia

Profil i oceny mają korzystać z lokalnego modelu bez klucza OpenAI. Research podstawowy ma uzyskać alternatywne wykonanie przez agenta z modelem lokalnym i narzędziami wyszukiwania oraz odczytu stron. Dotychczasowe OpenAI, Batch, historia i wspólny budżet pozostają obsługiwane.

Najpierw oddzielamy istniejące odpowiedzialności bez zmiany zachowania. Następnie dodajemy drugi adapter modelu i lokalne wykonanie, a później integrujemy agenta OpenCode. Pętlę agenta realizuje OpenCode. Pierwszą użyteczną lokalną funkcją jest profil; można ją pilotować przed zakończeniem prac nad researchowymi narzędziami.

Przed każdym etapem: przeczytać aktualny kod i jego niezacommitowane zmiany; przejrzeć i uaktualnić przygotowane requirements/SD tego etapu; uzgodnić materialne zmiany; dopiero potem oznaczyć zadanie jako gotowe. Przy implementacji zachowania użyć `implement-with-tester`. Nie wykonujemy commitu, push ani synchronizacji Dolt w ramach samego planu.

## Requirements i SD każdego etapu

Na zlecenie właściciela z 2026-11-04 przygotowano pary wszystkich etapów. Są to **projekty do przeglądu**, również gdy zadanie nie ma wcześniejszych blockerów. Przygotowanie par nie oznacza ich akceptacji; kontrakty późniejszych etapów trzeba zweryfikować na aktualnym kodzie i w pilotach.

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
| 9. Odbiór i stopniowe włączenie | [Requirements](etapy/09-odbior/requirements.md) | [SD](etapy/09-odbior/solution-design.md) |

## Etapy

| Etap | Wynik | Zależności | Pokrycie | Beads |
| --- | --- | --- | --- | --- |
| 1 | Wspólna konfiguracja i budżet poza modułem profilu | Przegląd pierwszego SD | LA-02, fundament LA-03/06 | `oferty-pracy-334.2` |
| 2 | Profil oddzielony od protokołu OpenAI | 1 | LA-02/03, fundament LA-04 | `oferty-pracy-334.3` |
| 3 | Oceny oddzielone od cyklu OpenAI Batch | 1 | LA-02/03, fundament LA-05 | `oferty-pracy-334.4` |
| 4 | Research oddzielony od obecnego wykonawcy OpenAI | 1 | LA-02/03, fundament LA-07 | `oferty-pracy-334.5` |
| 5 | Adapter Ollamy, profil z gpt-oss:20b i pilot sprzętu | 2; sprawdzenie wybranego modelu | LA-01/03/04/06/08 | `oferty-pracy-334.6` |
| 6 | Lokalne oceny pojedyncze i zbiorcze | 3, 5 | LA-01/05/06/08/10 | `oferty-pracy-334.7` |
| 7 | Wybrane źródło wyszukiwania i kontrolowane narzędzia WWW | Przegląd zakresu; zamknięcie O-L2 przed integracją live | LA-07/09 | `oferty-pracy-334.8` |
| 8 | OpenCode z gpt-oss:20b jako agent researchu | 4, 5, 7; kontrakt sesji i recovery | LA-01/03/06/07/08/09 | `oferty-pracy-334.9` |
| 9 | Odbiór mieszanej instalacji i stopniowe włączenie | 6, 8 | LA-01–LA-10 | `oferty-pracy-334.10` |

Numeracja wyznacza zalecaną kolejność pracy. Etapy 3 i 4 mogą być wykonywane po 1 niezależnie od 2; rozpoznanie wyszukiwarki w 7 nie wymaga ukończonej Ollamy. To zależności techniczne, nie polecenie równoległej edycji tych samych plików.

### Etap 1 — wydzielić konfigurację i budżet

Z `lib/profile/ai.ts` przenieść wspólne funkcje do `lib/ai/`, przełączyć konsumentów w ocenach i researchu. Szczegóły: [Requirements etapu 1](etapy/01-konfiguracja-budzet/requirements.md) i [SD etapu 1](etapy/01-konfiguracja-budzet/solution-design.md).

Zakończenie: identyczne obliczenia i zachowanie rezerwacji, stare konfiguracje nadal obsługiwane, brak migracji i nowych płatnych wywołań. Weryfikacja: jednostkowe ceny/konfiguracja oraz istniejące testy PG profilu, ocen i researchu. To pierwszy fragment do przeglądu wykonawczego.

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

Najpierw testy HTTP offline. Następnie pilot: sprawdzić istniejącą instalację i dostępność wybranego `gpt-oss:20b` bez automatycznego pobierania, połączenie z kontenera, pamięć, czas i poprawność cytatów na syntetycznym profilu. Nie narzucać aplikacyjnych kwot inferencji, tokenów ani współbieżności 1. Sprawdzić faktyczne parametry kontekstu modelu, obserwację postępu i możliwość anulowania; czas próby jest pomiarem, nie limitem całej lokalnej pracy.

Zakończenie: profil przez Ollamę działa bez klucza/cennika OpenAI; koszt API zero, nieznane tokeny pozostają nieznane, wyczerpany płatny budżet nie blokuje lokalnej propozycji. Model niedostępny lub zbyt mały kontekst daje kontrolowany błąd; nigdy ciche ucięcie wejścia lub fallback. To pierwszy punkt użytecznego wdrożenia.

### Etap 6 — uruchomić lokalne oceny

Dodać lokalnego wykonawcę zadania z etapu 3, używając adaptera z etapu 5. Zlecenie zbiorcze zachowuje komendę i wyniki per pozycja; praca jest porcjowana z trwałym postępem, bez tworzenia plików OpenAI. Uzupełnić wymagania i SD dopasowania o lokalny wariant oraz UI o dostawcę/model i właściwe statusy.

Zakończenie: pojedyncze i grupowe lokalne oceny przez `gpt-oss:20b` przechodzą te same kontrole dowodów i aktualności. Restart nie powtarza ukończonych pozycji. Współistnieją stare partie OpenAI i nowe lokalne zlecenia; zmiana ustawień nie przepisuje ich wykonawcy. Testy obejmują brak kwot lokalnej pracy, brak podwójnego wykonania oraz brak blokowania bezpłatnej synchronizacji źródeł.

### Etap 7 — wybrać wyszukiwanie i zbudować narzędzia

Najpierw rozstrzygnąć O-L2: porównać dostępne sposoby wyszukiwania pod kątem źródeł, warunków, utrzymania i kosztu. Nie zakładać, że lokalny model zapewnia bezpłatną wyszukiwarkę. Przy płatnym wariancie przed live wymagana jest jawna konfiguracja kosztu i zakresu próby.

Następnie zintegrować narzędzia z OpenCode przez wspierany mechanizm custom tools/MCP lub zweryfikowane narzędzia wbudowane. Zachować małe interfejsy `search` i `readPage`, kontrolowany HTTP, ekstrakcję tekstu i dowody zgodne z modułem researchu. Model nie ma powłoki, dostępu do plików ani narzędzi mutacji. Obsłużyć 403/429/timeouts oraz techniczną ochronę odczytu pojedynczej strony. Nie wprowadzać kwot liczby rund lub wywołań lokalnego modelu. Wbudowanego wyszukiwania OpenCode nie uznawać automatycznie za lokalne: sprawdzić jego zewnętrzny backend i warunki dostępności z Ollamą.

Zakończenie: narzędzia działają i są testowane niezależnie od LLM; rozróżniają snippet i odczyt strony, zapisują pochodzenie oraz datę, blokują dostęp do sieci lokalnej także przez DNS/redirect. Dostępność dozwolonych źródeł potwierdzona ograniczonym pilotem, bez obchodzenia blokad.

### Etap 8 — zintegrować OpenCode jako agenta researchu

Przed kodem dopracować parę researchu oraz kontrakt sesji i restartu OpenCode. Dodać adapter wykonania: worker → OpenCode headless → lokalna Ollama `gpt-oss:20b`. Preferowany do próby jest headless server z trwałymi sesjami, obserwacją i anulowaniem; CLI JSON może posłużyć do pilota protokołu. OpenCode prowadzi rozmowę i narzędzia; aplikacja zachowuje zlecenie, powiązanie z sesją, walidację i publikację. Nie pisać własnej pętli agenta. Końcowa synteza przechodzi istniejący schemat i kontrolę dowodów.

Zakończenie: research podstawowy przez OpenCode działa bez OpenAI, zachowując historię i źródła. Testy: izolacja sesji, nieznane narzędzie, zły argument, instrukcje w stronie, zmyślony adres/cytat, awaria procesu, anulowanie i restart. Sprawdzić brak narzuconych kwot lokalnego modelu i brak drugiej sesji dla nadal aktywnej operacji. Brak źródeł i przerwanie nie zastępują poprzedniego raportu; koszt płatnego narzędzia rozlicza się niezależnie od lokalnego modelu. Retencja danych/sesji OpenCode i izolacja jego konfiguracji są częścią odbioru.

### Etap 9 — odebrać całość i włączać stopniowo

Włączyć najpierw lokalny profil, potem kilka ręcznych ocen, później małą grupę i na końcu ręczny research. Nie przełączać automatycznie całej bazy i nie uruchamiać masowej ponownej oceny. Sprawdzić warianty mieszane: lokalny profil/oceny i OpenAI research oraz wszystkie trzy zastosowania lokalnie z jawnym źródłem wyszukiwania.

Zakończenie: pełne `pnpm check`, potrzebne integracje PostgreSQL/API na izolowanych schematach, build i kontrola UI. Osobna próba migracji na kopii ze starymi oczekującymi partiami, ponowne uruchomienie workera i kontrola rozliczeń. Powrót do OpenAI dla nowych zadań działa bez kasowania historii. Pilotaż daje zapis czasu i jakości na ustalonym małym zestawie, z widocznymi ograniczeniami wybranego modelu.

## Warunki akceptacji planu i otwarte wybory

Przed pierwszym kodem do przeglądu jest zakres etapu 1 w SD. Model (`gpt-oss:20b`), runtime agenta (OpenCode) i brak kwot Ollamy są ustalone. Przed pilotem 5 sprawdzamy ich działanie na hoście; przed 7 źródło wyszukiwania; przed 8 kontrakt sesji OpenCode i recovery. Te kwestie nie blokują przygotowania pierwszego refaktoru. Nie ustalamy terminów kalendarzowych bez pomiaru wybranego zestawu i sprawdzenia wyszukiwania.

Nie ma nowych testów ani zmian kodu w ramach tego dokumentu. Weryfikacja planu obejmuje odnośniki, pokrycie kryteriów etapami, zależności Beads i zachowanie zgodności opisanych kontraktów. Wynik planowania nie jest dowodem działania Ollamy lub agenta.
