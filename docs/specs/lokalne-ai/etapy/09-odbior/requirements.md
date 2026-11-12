# Etap 9: Odbiór i wspólne wdrożenie — Requirements

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 9 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.10`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

## Cel i granice

Odbiór pełnego przepływu, zgodności migracji, UI i mieszanej instalacji. Przygotowanie instrukcji uruchomienia oraz powrotu do OpenAI dla nowych zleceń. Bez masowego przeliczenia danych i bez nowej funkcjonalności domenowej.

Pokrycie przekrojowe: LA-01–LA-21. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 6 i 8 oraz panel zadań i ich zależności. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E09-R01 / E09-AC01 | Działające warianty konfiguracji | Zademonstrowano OpenAI legacy, lokalny profil/oceny z OpenAI research oraz wszystkie trzy zastosowania lokalnie z jawnym źródłem wyszukiwania. |
| E09-R02 / E09-AC02 | Zgodność danych po migracji | Na kopii z oczekującymi partiami i historią wdrożenie zachowuje możliwość odbioru, archiwizacji i cleanup. Nowe lokalne zadania nie zmieniają starych konfiguracji. |
| E09-R03 / E09-AC03 | Czytelny pełny przepływ | Właściciel rozpoznaje model, dostawcę, stan, częściowe wyniki, błąd i anulowanie; zatwierdza profil, przegląda oceny i otwiera źródła researchu. |
| E09-R04 / E09-AC04 | Odporność i koszty | Restart, duplikat dostarczenia i zmiana ustawień nie dublują publikacji ani aktywnej sesji. Lokalna praca działa przy wyczerpanym płatnym budżecie; narzędzia płatne przestrzegają budżetu. |
| E09-R05 / E09-AC05 | Bezpieczna zmiana nowych zleceń | Powrót konfiguracji do OpenAI przekierowuje wyłącznie nowe operacje, pozostawiając lokalną historię i obsługę aktywnych zadań. Brak automatycznego fallbacku. |
| E09-R06 / E09-AC06 | Udokumentowany odbiór techniczny | Raport wskazuje sprawdzone połączenia, obecność modelu w API, scenariusze integracyjne i ich wyniki. Nie wymaga benchmarku jakości odpowiedzi; właściciel ocenia jakość w normalnym użyciu. |

## Zależności i gotowość

Specyfikacja odbioru została przejrzana. Zamknięcie zadania wymaga wyników O-L1 oraz T01–T05, wszystkich etapów i panelu; częściowy lub zablokowany wynik nie uprawnia do wydania ani zamknięcia epiku.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.

Aktualizacja decyzji 2026-11-05: konfiguracja `.env`, bezterminowe zachowanie zebranych materiałów z wyjątkiem roboczego profilu Chrome, sprawdzanie modelu przez API bez pilota jakości oraz porcjowanie lokalnych ocen do 20 opisane są w [wymaganiach przekrojowych](../../requirements.md#doprecyzowanie-potwierdzone-2026-11-05). Próby techniczne API/sesji nie są testem jakości modelu.

E09-AC03/04/06 obejmują również PZ-01–PZ-08 oraz LA-11–LA-15. Odbiór całego zakresu wymaga ukończonego panelu i wyników T01–T05 z [kontraktów runtime](../../kontrakty-runtime.md), z jawnym opisem niewykonanych prób. Nie jest to ponowne otwarcie zatwierdzonych decyzji produktowych.

## Rozszerzenie kryteriów po grill-me

E09-AC03/04/06 obejmują LA-16–21: jedno wspólne wydanie z panelem, wspólny slot local direct/agent, ręczny retry niezmiennej migawki, błędna odpowiedź bez automatycznej generacji, infrastruktura bez automatycznej naprawy, snippet odrzucony jako dowód, brak danych właściciela w zapytaniach, inne publiczne źródła przed interwencją i sprzątanie zakończonego Chrome bez utraty archiwum. Instrukcja operatora obejmuje ręczne restarty oraz dowód końca niepewnego wykonania. Logowanie/parkowanie sesji (281) nie są warunkiem odbioru.
