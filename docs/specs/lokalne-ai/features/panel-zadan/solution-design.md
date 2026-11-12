# Panel zarządzania zadaniami — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Beads: `oferty-pracy-334.15`. Zakres PZ-01–PZ-08 zatwierdzony, implementacja nie została wykonana. Podstawa: [Requirements](requirements.md), [kontrakty runtime](../../kontrakty-runtime.md), stan kodu do sprawdzenia przed zmianami UI.

## Granice i kontrakt

Panel jest częścią obecnego Nuxt. API aplikacji autoryzuje komendę i przekazuje ją modułowi operacji, który używa adaptera wykonawcy. UI nie łączy się z OpenCode. Nie sterujemy surowymi jobami pg-boss; lista obejmuje zadania AI profilu, ocen i researchu.

Kanoniczny projekt endpointów, payloadu commandId/executionId/expectedRevision/action/scope/interventionId, statusów HTTP, trwałej intencji i deduplikacji jest w sekcji „Interwencja i polecenia panelu” [kontraktów runtime](../../kontrakty-runtime.md). Nie definiujemy drugiej odmiany payloadu w tym pliku. To projekt nowych endpointów, nie opis istniejących tras.

## Stan i odczyt

Mapowanie per domena, bez wymuszenia nowego enuma na wszystkich tabelach. Widok oddziela logiczną disposition, ostatni zaobserwowany stan runtime z datą, aktualny wynik i zdolności adaptera. skipped+running oraz superseded+unknown są możliwe. Lista i szczegóły pokazują model/dostawcę, błędy, grupę, kolejkę/blokujące wykonanie i historię poleceń. Późne odpowiedzi są dostępne z powodem braku publikacji.

Dla direct Ollama brak zdalnego execution ID oznacza brak zdalnej inspekcji; pokaż to jawnie. check nie uruchamia generacji kontrolnej. Stop próbuje przerwać lokalne połączenie, ale nie deklaruje zatrzymania serwera bez potwierdzenia. OpenAI Batch zachowuje swój cykl: akcja pozycji odbiera tylko jej publikację; zdalne anulowanie całej partii wymaga odpowiadającego zakresu grupowego.

## Publikacja, retry i wznowienie

Komenda i intencja w krótkiej transakcji; HTTP poza transakcją; osobny zapis obserwacji. Publikacja sprawdza token i dyspozycję pod tą samą blokadą co komendy. Wyniku już opublikowanego nie cofamy przez stop/skip.

Jawne retry jest dozwolone dla running/unknown: atomowo odebrana publikacja starego wykonania, nowy ID/token/supersedes i kolejka. Nowy agent OpenCode czeka na potwierdzone zwolnienie globalnego slotu. Odpowiedź starego pozostaje zapisana, bez wpływu na aktualny raport. Koszt i historia obu wykonań pozostają niezależne.

Resume wyłącznie dla konkretnej oczekującej interwencji; kontynuuje tę samą sesję i Chrome. Duplikat polecenia nie wysyła drugiej kontynuacji. Unknown wymaga inspekcji, nie nowego startu. Interwencję testujemy na kontrakcie modułu operacji/mostu etapu 8, UI nie prowadzi pętli agenta.

## Weryfikacja

| Kryterium | Scenariusz |
| --- | --- |
| PZ-01/05 | Logiczną dyspozycję i runtime widać osobno, także błędne sprawdzenie, kolejka i blokujący skipped+unknown. |
| PZ-02 | check nie tworzy sesji/inferencji; runtime niedostępny i direct bez zdalnej inspekcji. |
| PZ-03/04 | Stop/skip przed startem i podczas pracy; późny wynik/koszt; miejsce nie zwalnia się od samego kliknięcia. |
| PZ-06 | Retry running/unknown: nowe wykonanie queued, stara publikacja zablokowana, start dopiero po zwolnieniu slotu. |
| PZ-07 | 30 pozycji jako 20+10, item/group bez akcji na całym zleceniu nadrzędnym; akcje nie cofają ukończonych, zgodność starych Batch >20. |
| PZ-08 | Duplikat i zmiana payloadu, konflikt revision, wyścig z publikacją, duplikat resume i utrata odpowiedzi. |

Migracje addytywne, historia bezterminowa. Pełna integracja panelu zależy od etapów 6 i 8; wcześniejsze makiety/warstwa odczytu nie oznaczają odbioru całości. Etap 8 testuje interwencję bez gotowego UI, aby uniknąć cyklu zależności. Panel jest wymagany przed odbiorem etapu 9. Żadna tabela ani endpoint w projekcie nie jest dowodem wykonania migracji lub sprawności runtime.

## Uzgodnienie panelu po grill-me

LA-11 i LA-16–18: panel jest wymagany we wspólnym wdrożeniu całego epiku. Oczekiwanie i blokujący execution ID dotyczą jednej wspólnej kolejki lokalnego profilu, ocen i researchu. Stop/check/retry są kontrolą zadania, nie naprawą usług; nie dodawać automatycznego restartu infrastruktury ani przycisku pomijającego niepewność runtime.

PZ-06 wymaga kopii starego wejścia/instrukcji/schematu/modelu/parametrów przy ręcznym retry, nawet po zmianie profilu i `.env`. Nowe dane wymagają nowego zlecenia. Błąd formatu/dowodu/raportu jest widoczny i nie uruchamia automatycznej generacji naprawczej. PZ-01/05/08 obejmują mieszane lokalne zadania i trwałe rozstrzygnięcie po ręcznej obsłudze awarii według instrukcji. Logowanie i parkowanie sesji z przejściem do kolejnych zadań pozostają w backlogu281; obecne resume dotyczy tylko interwencji w publicznym dostępie.

## Przegląd wykonawczy — 2026-11-05

Specyfikacja panelu przygotowana do implementacji w ramach `334.20`, po etapach 6/8. Pełny payload item/group, nullable legacy execution, capabilities, paginacja i odczyt artefaktów mają jedno miejsce: doprecyzowanie [kontraktów runtime](../../kontrakty-runtime.md). Nie wymuszać executionId grupy ani kierować UI do API dostawcy. Komendy domenowe powstają w etapie 5; panel integruje je ze starymi wykonawcami i istniejącą autoryzacją Nuxt.

Właściciele zmian: nowy `lib/ai/operations/read.ts` i adaptery widoków per domena; trasy `server/api/ai/`; strona zadań w istniejącym app/pages oraz komponenty listy/szczegółów. Ostateczne nazwy nowych plików są lokalnym wyborem, kontrakty i własność reguł pozostają ustalone. Warstwa UI odświeża widok po poleceniu i pokazuje status przyjęcia oraz ostatnią obserwację runtime oddzielnie; ponowne wysłanie po utracie odpowiedzi używa tego samego commandId. Przy 409 odświeża stan i nie ponawia z nowym ID bez decyzji użytkownika.

Nie dodawać zbiorczego „retry wszystkich” na parent komendy. Group retry pomija opublikowane pozycje, pokazuje listę rzeczywiście ponowionych/pominiętych. Przy reused item pokazać wspólny request, aby zakres działania był widoczny. Stan nieznany starego superseded wykonania może blokować queued retry i całą kolejkę; szczegóły podają ID i instrukcję ręcznego rozstrzygnięcia. Brak zdalnej inspekcji direct to capability, nie błąd naprawiany generacją.

Obsługa legacy jest pełną częścią zadania: leniwe powiązania i guardy publikacji muszą zostać użyte w profile/ai.ts, matching publication/store/groups i companies/research.ts; samo zablokowanie przycisku nie chroni przed wynikiem w tle. Koszt starej próby rozlicza się niezależnie od prawa publikacji. Akcja Batch item nie przerywa pozostałych elementów partii. Nie odtwarzać brakującego starego promptu z aktualnego kodu bez rozpoznanej wersji.

| Kryteria | Minimalny zestaw testów |
| --- | --- |
| PZ-01/05 | Read API dla legacy i nowych trzech domen, stable cursor, kolejka/blokujący ID, cancelled+running i superseded+unknown, brak sekretów. |
| PZ-02 | check aktualizuje obserwację, awaria zachowuje datę poprzedniej; direct nie wykonuje generate. |
| PZ-03/04/08 | Dwa połączenia PG: komenda kontra publikacja w obu kolejnościach, command duplikat i zmieniony target/payload; dokładnie jedna rewizja albo brak publikacji. |
| PZ-06/07 | Retry po zmianie env/wejścia, group 20+10 bez akcji parent, ukończone pominięte, legacy >20 i część Batch nadal działa. |
| PZ-08 i resume | Błędny interventionId, 409 revision, restart/utrata odpowiedzi, brak drugiego resume/start; 401/404/422 i ochrona cudzych artefaktów. |

Dodać testy HTTP/read/commands na izolowanych schematach i test kluczowego przepływu UI; wykorzystać istniejące wzorce testów HTTP profilu. Dla artefaktów sprawdzić HTML jako tekst i brak traversal, a dla historii późny wynik bez publikacji. Check/build i integracje z RUN_INTEGRATION=1 wymagane; screenshot UI i scenariusz interwencji jako dowód odbioru, bez benchmarku treści LLM. Żadna makieta nie zastępuje testu wyścigu w bazie.

Wariant Chrome po doprecyzowaniu: headless w kontenerze. Panel udostępnia uwierzytelniony link do gotowego DevTools odpowiedniej karty podczas interwencji. To kanał właściciela, bez dostępu modelu do administracyjnego CDP i bez kont osobistych. Kwalifikacja oraz test UI muszą wykazać podgląd/input i Wznów tej samej sesji; sam screenshot nie spełnia interwencji.
