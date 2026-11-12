# Etap 2: Profil niezależny od protokołu OpenAI — Requirements

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 2 z dziewięciu; przegląd w ramach `oferty-pracy-334.20`, bez implementacji i testów aplikacji. Beads: `oferty-pracy-334.3`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty SD są decyzjami technicznymi do realizacji w zatwierdzonym zakresie; weryfikacja działania pozostaje częścią implementacji.

## Cel i granice

Wydzielenie transportu pojedynczego wywołania OpenAI. Dotyczy istniejącej propozycji profilu; nie zmienia modelu, cennika, reguł zatwierdzania ani lokalnego parsera CV.

Pokrycie przekrojowe: LA-02, LA-03; fundament LA-04. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etap 1. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E02-R01 / E02-AC01 | Ten sam materiał i propozycja | Dla zapisanego tekstu importu przygotowane instrukcje i schemat opisują ten sam zakres; dane kontaktowe pozostają usunięte zgodnie z obecną regułą. |
| E02-R02 / E02-AC02 | Niezależna walidacja profilu | Odpowiedź zgodna syntaktycznie, ale z niepotwierdzonym cytatem, jest odrzucana. Odpowiedź poprawna daje propozycję; aktywny profil zmienia dopiero zatwierdzenie właściciela. |
| E02-R03 / E02-AC03 | Jawne niepowodzenie modelu | Odmowa, odpowiedź niepełna, błędny JSON, brak lub wiele treści końcowych oraz awaria sieci nie publikują propozycji jako poprawnej; komunikat nie ujawnia treści CV ani sekretów. |
| E02-R04 / E02-AC04 | Zgodne próby i rozliczenie | Dotychczasowe retry i recovery pozostają zgodne. Utrata telemetrii nie jest traktowana jako zerowe zużycie; nie powstaje podwójny efekt po powtórnym dostarczeniu zadania. |

## Zależności i gotowość

Kontrakt StructuredModel, normalizacja i typowane błędy zostały rozstrzygnięte w SD po przeglądzie kodu. Wymagana implementacja etapu 1; brak otwartej decyzji produktowej.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
