# Etap 7: Wyszukiwanie i odczyt stron dla OpenCode — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 7 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.8`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Wybór źródła wyszukiwania i integracja narzędzi researchu z pochodzeniem dowodów. Testowalne bez LLM. Bez prowadzenia rozmowy agenta i bez publikowania raportów.

Pokrycie przekrojowe: LA-06, LA-07, LA-09. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

O-L2 przed użyciem live. Nie wymaga ukończenia adaptera Ollamy do testów narzędzi. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E07-R01 / E07-AC01 | Jawne źródło i koszt wyszukiwania | Konfiguracja wskazuje usługę, warunki użycia i politykę kosztową. Brak konfiguracji nie uruchamia domyślnej usługi zewnętrznej; płatne wywołanie ma pokrycie przed wysłaniem. |
| E07-R02 / E07-AC02 | Dowody z faktycznego odczytu | Snippet pozostaje search_snippet; page powstaje tylko po pobraniu strony. Każdy dowód ma nadany przez aplikację ID, tekst, URL, tytuł i datę odczytu. |
| E07-R03 / E07-AC03 | Kontrolowany dostęp WWW | Adresy prywatne, lokalne, metadane i przekierowania do nich są odrzucane, także dla IPv6 i zmian DNS; agent nie otrzymuje plików ani powłoki. |
| E07-R04 / E07-AC04 | Jawne braki i błędy | 403, 429, timeout, zbyt duża strona i nieobsługiwany format nie dają fikcyjnego dowodu strony. Częściowe wyniki mają oznaczenie częściowego odczytu. |
| E07-R05 / E07-AC05 | Izolacja operacji i danych | Dowody jednej operacji nie mogą zostać podane jako dowody drugiej; wyszukiwarka nie dostaje CV, pełnego profilu ani sekretów. Instrukcje w stronie nie zmieniają uprawnień. |
| E07-R06 / E07-AC06 | Niezależność od limitów modelu | Ochrona pojedynczego odczytu nie ogranicza liczby rund lub inferencji Ollamy; brak płatnego budżetu zatrzymuje płatne narzędzie, z jawną przyczyną. |

## Zależności i gotowość

O-L2 blokuje wybór dostawcy, warunków, taryfy i pełne wykonanie live. Mechanizm mostu custom tools/MCP oraz wartości ochrony pojedynczego odczytu są propozycjami do potwierdzenia. Nie są obietnicą gotowej integracji.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
