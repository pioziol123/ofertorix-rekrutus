# Panel zarządzania zadaniami — Requirements

Status: **zakres zatwierdzony, specyfikacja po przeglądzie gotowa do implementacji**, 2026-11-05. Beads: `oferty-pracy-334.15`. Potwierdzono potrzebę panelu oraz ręczne sprawdzanie, zatrzymanie i pominięcie zadania. Właściciel potwierdził zakres i reguły działań poniżej; szczegóły techniczne SD i kontraktów runtime trzeba zweryfikować podczas implementacji. Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md).

## Potwierdzony zakres

Pierwszy zakres: zadania AI profilu, ocen i researchu, również z grupami lokalnymi do 20 i OpenAI Batch. Synchronizacje źródeł i pozostałe zadania w tle są poza pierwszym zakresem; nie tworzymy interfejsu ogólnego sterowania dowolnymi jobami pg-boss. Panel w istniejącej aplikacji, z obecnym prywatnym dostępem.

## Wymagania i kryteria

| ID | Reguła | Obserwowalny warunek akceptacji |
| --- | --- | --- |
| PZ-01 | Lista i szczegóły operacji | Widoczne typ, przedmiot, grupa, dostawca/model, stan aplikacji, ostatni znany stan runtime, data ostatniego potwierdzenia i aktualny błąd. Brak kontaktu nie oznacza zatrzymania. |
| PZ-02 | Sprawdź teraz | Żądanie wymusza próbę aktualizacji istniejącej operacji/sesji, bez tworzenia nowej inferencji lub sesji. Niedostępny runtime daje informację o nieudanym sprawdzeniu i zachowuje ostatnią obserwację z datą. |
| PZ-03 | Zatrzymaj | Oczekujące zadanie nie startuje; działające otrzymuje żądanie zatrzymania i blokadę publikacji. Zakończenie procesu potwierdza adapter, nie sam klik. Brak potwierdzenia pozostaje niepewny. |
| PZ-04 | Pomiń | Zadanie zostaje wyłączone z dalszego przetwarzania i publikacji bez udawania, że runtime został zatrzymany. Ukończone wyniki innych pozycji pozostają. Późny wynik jest zachowany diagnostycznie, ale nie staje się aktywną oceną/raportem. |
| PZ-05 | Stan logiczny i faktyczne wykonanie | Pominięte zadanie może nadal mieć runtime running/unknown; użytkownik widzi to i nadal może żądać sprawdzenia/zatrzymania. Pominięcie nie zeruje kosztu ani nie oznacza sukcesu. |
| PZ-06 | Jawne ponowienie | Nowe wykonanie ma własny identyfikator i wskazanie poprzedniego. Nie nadpisuje historii. Jawne ponowienie jest dozwolone także przy running/unknown. Poprzednie wykonanie traci prawo publikacji, otrzymuje próbę zatrzymania, a jego ewentualna późniejsza odpowiedź pozostaje dostępna do wglądu bez publikacji. |
| PZ-07 | Obsługa grup | Działanie wskazuje pojedyncze zadanie AI: pozycję albo grupę do 20; bez akcji na całym zleceniu nadrzędnym. Liczniki sukces/błąd/anulowane/pominięte/nieznane są osobne. Akcja grupowa nie zmienia ukończonych pozycji. |
| PZ-08 | Historia poleceń i wyścigi | Powtórzenie tego samego polecenia nie tworzy podwójnego efektu. Zatrzymanie/pominięcie atomowo rozstrzyga wyścig z publikacją; jeśli wynik już opublikowano, panel pokazuje ten fakt zamiast go wycofać. Wszystkie polecenia i skutki są zachowane bezterminowo. |

## Rozstrzygnięcia PZ-O1–PZ-O6 — 2026-11-05

- PZ-O1 zamknięte: pierwszy zakres tylko AI.
- PZ-O2 zamknięte: pominięcie blokuje publikację i pozwala kontynuować grupę, bez kasowania historii.
- PZ-O3 zamknięte: użytkownik może jawnie ponowić running/unknown. Stare wykonanie jest zatrzymywane, jeśli się da, i zawsze traci uprawnienie do publikacji. Odpowiedź przechowujemy do wglądu.
- PZ-O4 zamknięte: pominięcie działającego zadania obejmuje próbę zatrzymania, bez utożsamiania braku potwierdzenia z zatrzymaniem.
- PZ-O5 pozostaje szczegółem technicznym: check direct Ollama bez ID wykonania pokazuje brak możliwości potwierdzenia; nie generuje odpowiedzi kontrolnej.
- PZ-O6 zamknięte: w Batch blokada publikacji jednej pozycji nie wymaga anulowania całej partii. Zdalne zatrzymanie partii stosować tylko przy akcji na odpowiadającym jej zadaniu grupowym, z widocznym zakresem. Historycznych grup >20 nie dzielimy; sposób odczytu starych rekordów wymaga zgodności.

Potwierdzono również: ukończonej publikacji nie cofamy kliknięciem stop/skip; flow Google przez dedykowaną przeglądarkę i oczekiwanie na działanie użytkownika przy blokadzie są przyjęte. Szczegóły ponownego uruchomienia po interwencji i weryfikacji stanu są kontraktem technicznym [SD](solution-design.md). Nie oznacza to zgody na rozpoczęcie implementacji całej inicjatywy.

## Kolejka i interwencja — potwierdzone 2026-11-05

Dla wszystkich lokalnych prac AI obowiązują [LA-11–LA-15](../../requirements.md). Panel pokazuje oczekiwanie w kolejce i wykonanie, które blokuje następne, również gdy jest pominięte, anulowane logicznie lub ma stan unknown. Jawne retry jest nadal dozwolone i odcina starą publikację, ale nowe wykonanie czeka na potwierdzony koniec poprzedniego agenta. Zastępuje to wcześniejszą możliwość natychmiastowego startu bez potwierdzenia abort. Stop/skip nie oznacza zwolnienia zasobów.

Przycisk „Wznów” po interwencji kontynuuje to samo wykonanie/sesję, bez utworzenia nowego. Niedostępny lub utracony stan przeglądarki daje jawny błąd zamiast udawanej kontynuacji. PZ-01/03/04/06/08 obejmują te zachowania; PZ-08 obejmuje także idempotentne wznowienie. Nie dodajemy w tym zakresie automatycznego logowania ani edycji priorytetów kolejki.

## Uzgodnienie panelu po grill-me

LA-11 i LA-16–18: panel jest wymagany we wspólnym wdrożeniu całego epiku. Oczekiwanie i blokujący execution ID dotyczą jednej wspólnej kolejki lokalnego profilu, ocen i researchu. Stop/check/retry są kontrolą zadania, nie naprawą usług; nie dodawać automatycznego restartu infrastruktury ani przycisku pomijającego niepewność runtime.

PZ-06 wymaga kopii starego wejścia/instrukcji/schematu/modelu/parametrów przy ręcznym retry, nawet po zmianie profilu i `.env`. Nowe dane wymagają nowego zlecenia. Błąd formatu/dowodu/raportu jest widoczny i nie uruchamia automatycznej generacji naprawczej. PZ-01/05/08 obejmują mieszane lokalne zadania i trwałe rozstrzygnięcie po ręcznej obsłudze awarii według instrukcji. Logowanie i parkowanie sesji z przejściem do kolejnych zadań pozostają w backlogu281; obecne resume dotyczy tylko interwencji w publicznym dostępie.

## Wynik przeglądu wykonawczego

2026-11-05, zadanie 334.20: rozstrzygnięto item/group, revision, legacy guard, paginację/capabilities i odczyt artefaktów w SD oraz runtime. Do realizacji wymagane etapy 6/8. Headless Chrome ma prywatny podgląd DevTools i ręczną interwencję w tej samej sesji; nie zmienia to PZ-01–08. Brak otwartej decyzji produktowej panelu; kryteria wymagają implementacji i dowodów.
