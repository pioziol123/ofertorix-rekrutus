# Etap 3: Oceny oddzielone od OpenAI Batch — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 3 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.4`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Rozdzielenie przygotowania i publikacji oceny od protokołu OpenAI Batch. Zachowanie działających ocen pojedynczych/grupowych, ich archiwizacji i kosztów. Bez lokalnego wykonania.

Pokrycie przekrojowe: LA-02, LA-03; fundament LA-05. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etap 1. Kontrakt modelu z etapu 2 nie jest wymagany do samego wydzielenia Batch. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E03-R01 / E03-AC01 | Niezmieniona treść oceny | Te same wejścia i wersje profilu/ogłoszenia prowadzą do tych samych instrukcji i schematu; walidatory odrzucają brak lub powtórzenie kryterium i niepotwierdzone dowody. |
| E03-R02 / E03-AC02 | Zgodny cykl Batch | Istniejące partie można wysłać, odpytać, odebrać i posprzątać, z zachowaniem custom_id i archiwum diagnostycznego; brak pliku wynikowego jest odróżniony od poprawnego wyniku. |
| E03-R03 / E03-AC03 | Niezależne wyniki grupy | Wyniki poza kolejnością trafiają do właściwych pozycji; błąd jednej pozycji nie usuwa poprawnych. Finansowanie płatnej grupy pozostaje atomowe. |
| E03-R04 / E03-AC04 | Jedna publikacja i aktualność | Powtórny wynik nie publikuje drugiej rewizji. Wynik dla starszej wersji wejść nie wypiera aktualnej oceny; komenda grupowa z tym samym ID zachowuje idempotencję. |
| E03-R05 / E03-AC05 | Jawny nieznany skutek wysłania | Awaria po wysłaniu create i przed zapisem ID nie uruchamia ślepo kolejnej płatnej partii. Koszt oraz stan niepewny pozostają widoczne. |

## Zależności i gotowość

Przed zmianą applyMatchingLine ponownie sprawdzić bieżące prace nad archiwum Batch. Lokalny wariant kryteriów AC-B1/AC-G4–G7 zostanie dopisany w etapie 6; w tym etapie nie zmieniają znaczenia.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
