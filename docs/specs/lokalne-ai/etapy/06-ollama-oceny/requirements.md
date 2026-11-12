# Etap 6: Lokalne oceny pojedyncze i zbiorcze — Requirements

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 6 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.7`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

## Cel i granice

Wykonanie neutralnych zadań oceny przez Ollamę gpt-oss:20b. Współistnienie lokalnych grup i starych partii Batch. Bez zmiany reguł oceny i bez masowej ponownej oceny bazy.

Pokrycie przekrojowe: LA-01, LA-03, LA-05, LA-06, LA-08, LA-10. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 3 i 5. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E06-R01 / E06-AC01 | Te same reguły oceny | Lokalna odpowiedź przechodzi te same walidatory co Batch: komplet kryteriów, obustronne cytaty, niewiadome, rating, kompletność i aktualność. |
| E06-R02 / E06-AC02 | Grupa niezależnych wyników | Jedna komenda tworzy trwałe grupy do 20 pozycji, np. 30 → 20 + 10, bez utraty pozycji; poprawne pozycje są publikowane pomimo błędu innych. Ponowna komenda nie dubluje grup ani członków. |
| E06-R03 / E06-AC03 | Wznowienie bez ponownej publikacji | Restart pomija ukończone pozycje, claim chroni przed równoległym wykonaniem, a podwójna odpowiedź nie tworzy kolejnej rewizji. |
| E06-R04 / E06-AC04 | Brak fikcyjnego Batch i kwot | Lokalne zadanie nie tworzy plików ani partii OpenAI. Płatny budżet go nie blokuje; grupa nie ma limitu liczby lokalnych inferencji wynikającego z ograniczeń Batch. |
| E06-R05 / E06-AC05 | Rozpoznawalny stan i anulowanie | UI pokazuje lokalnego dostawcę/model, liczbę pozycji i ich stany. Anulowanie pozostawia opublikowane oceny i zatrzymuje publikację nieukończonych pozycji. |
| E06-R06 / E06-AC06 | Zgodne stare partie | Po włączeniu lokalnych ocen oczekujące partie OpenAI nadal są odbierane, archiwizowane i sprzątane; zmiana konfiguracji nie przepisuje ich wykonawcy. |

## Zależności i gotowość

API nadrzędnej komendy i stan grupy przy unknown określa uzupełnienie SD z 2026-11-05. Strategia zatrzymania i wspólny slot pochodzą z etapu 5. Nie ma otwartej decyzji produktowej.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.

## Uzupełnienie po grill-me — zatwierdzone 2026-11-05

LA-11 obejmuje tę ścieżkę wspólną kolejką jednej lokalnej pracy AI razem z researchem. Odbiór wymaga braku równoległej generacji przy mieszaninie profilu, ocen i OpenCode, również między workerami. Unknown zajmuje slot, retry może być queued bez startu. Zły JSON/dowód kończy próbę, bez kolejnej automatycznej generacji; ręczne retry ma niezmienne wejście i konfigurację zgodnie z LA-17. Infrastruktura jest obsługiwana ręcznie (LA-18). Ten etap jest częścią jednego wspólnego wydania z panelem (LA-16), nie osobnym wydaniem. Kontrakt kolejki i direct HTTP: [runtime](../../kontrakty-runtime.md).

E06-AC02: grupa20 tworzy20 niezależnych żądań/ocen, a nie jeden prompt z20 ofertami. E06-AC03/05 obejmują wspólny slot i ręczne retry bez nowego wejścia; unknown pozycji jest odrębny od ukończonej pozycji i blokuje start innych lokalnych prac do potwierdzenia końca.
