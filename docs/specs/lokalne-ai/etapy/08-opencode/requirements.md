# Etap 8: OpenCode jako agent researchu z gpt-oss:20b — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 8 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.9`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Zintegrowanie gotowego runtime OpenCode z ręcznym researchem podstawowym. OpenCode prowadzi rozmowę i używa narzędzi; aplikacja odpowiada za zlecenie, dowody, koszty, walidację i publikację. Bez własnej pętli agenta.

Pokrycie przekrojowe: LA-01, LA-03, LA-06, LA-07, LA-08, LA-09. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 4, 5 i 7; zamknięcie kontraktu sesji O-L3. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E08-R01 / E08-AC01 | Lokalny agent bez OpenAI | Research używa OpenCode i gpt-oss:20b w Ollamie bez klucza OpenAI; nie włącza chmury ani alternatywnych modeli automatycznie. |
| E08-R02 / E08-AC02 | Kontrolowana sesja | Każde zlecenie jest powiązane z konkretną sesją i wersją runtime. Zmiana konfiguracji lub restart nie wybiera ostatniej globalnej sesji i nie tworzy drugiego aktywnego researchu. |
| E08-R03 / E08-AC03 | Raport sprawdzany przez domenę | Zakończenie sesji bez prawidłowego raportu jest błędem. Nieznane dowody, URL i cytaty są odrzucane; poprzedni raport pozostaje dostępny. |
| E08-R04 / E08-AC04 | Brak kwot i możliwość anulowania | Długi research nie jest ucinany przez limit rund, wywołań, tokenów ani stały deadline. Anulowanie zatrzymuje publikację i jest odróżnialne od ukończenia oraz niepewnego stanu sesji. |
| E08-R05 / E08-AC05 | Wyłącznie uzgodnione uprawnienia | Agent może używać tylko narzędzi etapu 7, nie powłoki, plików, delegacji lub interaktywnych pytań; nie dziedziczy osobistych pluginów, sekretów i konfiguracji. |
| E08-R06 / E08-AC06 | Oddzielne koszty i retencja | Koszt modelu pozostaje zero, narzędzia płatne są rozliczane mimo błędu raportu. Dane sesji mają określoną retencję i usunięcie sesji nie usuwa opublikowanej historii. |

## Zależności i gotowość

O-L3 jest bramką: wersja i korelacja sesji, rozpoznanie startu/wyniku, anulowanie, odtwarzanie i retencja. Proponowana tabela nie dowodzi, że obecne API spełnia kontrakt. O-L2 musi być zamknięte przez etap 7. Nie ma otwartej decyzji o modelu, runtime ani kwotach Ollamy.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
