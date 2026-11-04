# Etap 4: Research niezależny od wykonawcy OpenAI — Requirements

Status: **projekt do przeglądu**, 2026-11-04. Etap 4 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.5`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

## Cel i granice

Wydzielenie wykonawcy istniejącego ręcznego researchu podstawowego. Zachowanie wyszukiwania OpenAI i syntezy jako jednego zgodnego wykonawcy. Bez OpenCode i nowych narzędzi.

Pokrycie przekrojowe: LA-02, LA-03; fundament LA-07. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etap 1. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E04-R01 / E04-AC01 | Zachowane zlecenie i reuse | Ta sama komenda nie tworzy kolejnej operacji; istniejący raport jest ponownie używany zgodnie z obecną regułą, a jawny refresh może utworzyć nową wersję. |
| E04-R02 / E04-AC02 | Publikacja tylko po walidacji | Raport z nieznanym źródłem, błędnym cytatem albo bez wymaganego pokrycia jest odrzucany. Poprzednia wersja pozostaje dostępna. |
| E04-R03 / E04-AC03 | Zachowane koszty obu kroków | Błąd syntezy po poprawnym wyszukiwaniu nie zeruje kosztu wykonanego wyszukiwania; brak potwierdzenia kosztu pozostaje nieznany. |
| E04-R04 / E04-AC04 | Zgodne awarie i recovery | Restart przy nieznanym skutku płatnej pracy nie uruchamia automatycznie nowego wyszukiwania. Wynik i historia kończą się tak jak przed refaktorem. |

## Zależności i gotowość

Przed implementacją uzgodnić finalny kształt przenoszenia accounting z błędem. Nie wymaga decyzji o wyszukiwarce OpenCode (O-L2).

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.
