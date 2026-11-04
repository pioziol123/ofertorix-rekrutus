# Etap 6: Lokalne oceny pojedyncze i zbiorcze — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 6 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.7`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

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
| E06-R02 / E06-AC02 | Grupa niezależnych wyników | Jedna komenda tworzy trwałą grupę; poprawne pozycje są publikowane pomimo błędu innych. Ponowna komenda nie dubluje grupy ani członków. |
| E06-R03 / E06-AC03 | Wznowienie bez ponownej publikacji | Restart pomija ukończone pozycje, claim chroni przed równoległym wykonaniem, a podwójna odpowiedź nie tworzy kolejnej rewizji. |
| E06-R04 / E06-AC04 | Brak fikcyjnego Batch i kwot | Lokalne zadanie nie tworzy plików ani partii OpenAI. Płatny budżet go nie blokuje; grupa nie ma limitu liczby lokalnych inferencji wynikającego z ograniczeń Batch. |
| E06-R05 / E06-AC05 | Rozpoznawalny stan i anulowanie | UI pokazuje lokalnego dostawcę/model, liczbę pozycji i ich stany. Anulowanie pozostawia opublikowane oceny i zatrzymuje publikację nieukończonych pozycji. |
| E06-R06 / E06-AC06 | Zgodne stare partie | Po włączeniu lokalnych ocen oczekujące partie OpenAI nadal są odbierane, archiwizowane i sprzątane; zmiana konfiguracji nie przepisuje ich wykonawcy. |

## Zależności i gotowość

Przed implementacją domknąć API dużych lokalnych komend i ostateczny stan grupy przy unknown. To propozycja rozszerzenia istniejącego API; nie zmieniać kontraktu Batch bez przeglądu. Strategia przerwania lokalnego HTTP pochodzi z etapu 5.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
