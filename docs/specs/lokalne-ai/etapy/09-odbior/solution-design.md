# Etap 9: Odbiór i stopniowe włączenie — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 9 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.10`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E09-R01–E09-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Odbiór jest przekrojowy: WWW, worker, PostgreSQL, Ollama, OpenCode i wyszukiwarka. Wyniki umieścić w docs/specs/lokalne-ai/odbior.md dopiero po wykonaniu prób; dokument zawiera komendę/scenariusz, konfigurację bez sekretów, wynik i ograniczenia. Nie dopisywać statusów wykonania do tabeli planu zamiast aktualizacji Beads.

## Decyzja E09-D01 — Odbiór etapami i zmiana trasowania nowych zleceń

**Propozycja:** Masowe przepisanie oczekujących operacji naruszyłoby migawki. Powrót konfiguracji jest odrębny od cofnięcia obrazu aplikacji i migracji.

Punkty integracji w obecnym katalogu: [package.json](../../../../../package.json), [worker/index.ts](../../../../../worker/index.ts), [README.md](../../../../../README.md). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

Macierz odbioru obejmuje legacy OpenAI oraz warianty mieszane; konfiguracja działa per zastosowanie według etapu 5. Dla każdego scenariusza zapisać operation/request/attempt ID oraz session ID jeśli dotyczy, identyfikatory wersji wejść i wynik. Nie kopiować prywatnego CV do raportu odbioru.

Test migracji: kopia izolowanej bazy z reprezentatywnymi queued/submitted/unknown i terminalnymi OpenAI, uruchomienie nowych migracji, start workera, odbiór/cleanup i odczyt UI. Sprawdzić częściowe indeksy dla wszystkich nowych stanów aktywnych. Test starego obrazu aplikacji na nowych danych jest osobnym wynikiem, nie domyślną gwarancją.

Włączać jawnie: profil → kilka ocen → grupa → ręczny research. Po każdym kroku ocenić wynik i historię. Nie zmieniać masowo istniejących zleceń. Przy problemie wyłączyć tworzenie nowych lokalnych operacji i wskazać OpenAI dla nowych; nadal obsługiwać stare migawki. Nie cofać wykonanych migracji kasujących dane; korekty forward-only. Przywrócenie starego obrazu tylko jeśli osobny test wykazał zgodność.

Raport jakości odróżnia walidację formatu/dowodów od przydatności treści. Małe próbki syntetyczne są dozwolone; prywatny materiał użyć dopiero w docelowym lokalnym przepływie. Nie narzucać arbitralnego progu liczby udanych prób ani stałego czasu lokalnego zadania. Nierozstrzygnięta krytyczna próba blokuje uznanie danego wariantu za odebrany.

## Migracja i uruchomienie

Zaktualizować README i .env.example zgodnie z rzeczywiście sprawdzoną instalacją: endpointy z kontenerów, wersje, dostępność modeli, izolacja i retencja OpenCode, uruchomienie/restart/anulowanie i diagnostyka. Nie pobierać modeli ani nie zmieniać globalnych ustawień właściciela w ramach samej dokumentacji. Odbiór nie upoważnia do git/Dolt push.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. pnpm check, pnpm build oraz potrzebne integracje RUN_INTEGRATION=1 na izolowanych schematach.
2. Macierz legacy/mixed/local z aktywną starą partią, zero lokalnego kosztu i płatnym narzędziem.
3. Fault injection restart, utrata lease, network, duplikaty i race anulowania/publikacji.
4. Przegląd UI oraz pilota i jakości przez właściciela; wynik każdego LA-01–LA-10 z dowodem albo jawnym brakiem.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E09-AC01 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC03 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC04 | Próby 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC05 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E09-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

Odbiór pełnego lokalnego researchu wymaga zamknięcia O-L1–O-L3 i przeglądu dokumentów. Jeśli etap częściowy przeszedł, można odebrać wyłącznie ten zakres; nie oznacza to odbioru całości.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.
