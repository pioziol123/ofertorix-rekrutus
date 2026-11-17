# Oferty

Moduł Oferty pozwala właścicielowi przeglądać oferty pracy: przeszukiwać listę, filtrować ją, sortować i otwierać szczegóły oferty. Docelowo odpowiada też za grupowanie ogłoszeń źródłowych tej samej rekrutacji w jedną ofertę pracy; tej części jeszcze nie ma. Opis podaje odpowiedzialność modułu, stan jej wdrożenia, publiczne operacje, budowę katalogu i zależności. [Słownik domeny](../../GLOSSARY.md) · [Mapa modułów](../../docs/architecture/moduly.md)

## Odpowiedzialność

**Ogłoszenie źródłowe** to wpis w jednym portalu z własną treścią i historią zmian; pobiera je i przechowuje moduł [Źródła ofert](../sources/README.md). **Oferta pracy** to wspólna możliwość zatrudnienia, z którą może być powiązanych kilka ogłoszeń tej samej rekrutacji. Moduł Oferty odpowiada za:

- **grupowanie ogłoszeń w oferty pracy**: ustalenie, które ogłoszenia dotyczą tej samej rekrutacji, połączenie ofert i ich rozdzielenie na polecenie właściciela;
- **przeglądanie ofert**: listę z filtrami widoku, sortowaniem i stronicowaniem, szczegóły oferty z historią zmian treści oraz prezentację wynagrodzeń, w tym ocenę, czy widełki spełniają filtr wynagrodzenia.

Moduł nie ocenia zgodności oferty z profilem zawodowym; to zadanie Dopasowania. Oferty korzystają z jego wyniku przy filtrowaniu i sortowaniu listy.

## Stan wdrożenia

- **Grupowanie nie jest wdrożone** i nie należy do epiku `oferty-pracy-0mq` (Poprawki architektury kodu). Do tego czasu każde ogłoszenie źródłowe jest pokazywane jako osobna oferta, a identyfikator oferty jest identyfikatorem ogłoszenia.
- **Odczyt ogłoszeń jest przejściowy.** Moduł czyta tabele Źródeł bezpośrednio i sam tłumaczy zapisaną treść ogłoszenia na postać oferty. Zadanie `oferty-pracy-0mq.6` zastępuje te zapytania publicznym odczytem Źródeł i przenosi tłumaczenie treści do Źródeł.
- **Wynik oceny dopasowania** na liście pochodzi z dotychczasowego odczytu Dopasowania, do czasu zadań `oferty-pracy-0mq.6` i `oferty-pracy-0mq.18`.
- **Filtrowanie odbywa się w pamięci** na całym katalogu, który może liczyć najwyżej 10 000 ogłoszeń; większy katalog kończy odczyt listy błędem.

## Publiczne operacje

Serwer i inne moduły importują operacje z `index.ts`. Widoki działają w przeglądarce, więc mają osobne wejście `view.ts`, które nie sięga do kodu serwera.

| Operacja                                                             | Wejście    | Kontrakt                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Odczyt filtrów listy (`parseFilters`)                                | `index.ts` | Przyjmuje parametry zapytania listy i zwraca filtry z wartościami domyślnymi. Wartość spoza dopuszczalnego kształtu zgłasza błąd; trasa API odpowiada wtedy kodem 400. Minimalne wynagrodzenie wymaga waluty i okresu.                                                                                                                                                                                    |
| Lista ofert (`listOffers`)                                           | `index.ts` | Przyjmuje filtry i zwraca stronę 20 ofert bez opisu i historii, z wynikiem dopasowania wynagrodzenia każdej z nich, łączną liczbę pasujących ofert, numer strony, zastosowane filtry i opcje filtrów zebrane z całego katalogu. Strona większa niż ostatnia daje ostatnią. Każda oferta niesie podsumowanie oceny dopasowania, którego używają filtry oceny i sortowanie po ratingu przed stronicowaniem. |
| Szczegóły oferty (`readOffer`)                                       | `index.ts` | Przyjmuje identyfikator i zwraca ofertę z aktualną treścią oraz listą wersji treści od najnowszej, bez treści wcześniejszych wersji. Identyfikator, który nie jest UUID albo nie wskazuje oferty, daje brak wyniku.                                                                                                                                                                                       |
| Projekcja ogłoszenia (`projectOffer`)                                | `index.ts` | Przejściowa: Dopasowanie i Firmy tłumaczą nią zapisane ogłoszenie na postać oferty. Znika w zadaniu `oferty-pracy-0mq.6`.                                                                                                                                                                                                                                                                                 |
| Zapytanie formularza filtrów (`offerFilterQuery`, `hasSalaryFilter`) | `view.ts`  | Budują parametry zapytania z formularza listy, pomijając wynagrodzenie, gdy ten filtr jest wyłączony, i rozpoznają, czy zapytanie zawiera filtr wynagrodzenia.                                                                                                                                                                                                                                            |

Oba wejścia eksportują też typy oferty (`OfferView`) i wynagrodzenia (`Salary`); `index.ts` dodatkowo typ filtrów i strony listy.

Odczyty nie zakładają blokad i działają w transakcji wywołującego, jeśli taka trwa.

## Budowa katalogu

| Miejsce                                             | Zawartość                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`, `view.ts`                               | Publiczne wejścia: dla serwera i innych modułów oraz dla widoków.                                                                               |
| `list-offers.ts`, `read-offers.ts`, `read-offer.ts` | Operacje listy, odczytu katalogu i szczegółów.                                                                                                  |
| `offer-view.ts`                                     | Typ oferty i wynagrodzenia wspólny dla operacji.                                                                                                |
| `domain/`                                           | Reguły na przekazanych danych: filtry, dopasowanie wynagrodzenia, filtrowanie, sortowanie, stronicowanie i opcje filtrów, zapytanie formularza. |
| `infrastructure/adapters/`                          | Przejściowy odczyt tabel Źródeł i tłumaczenie treści ogłoszenia na ofertę.                                                                      |

Testy jednostkowe reguł i test odczytu na izolowanej bazie leżą w module. Test tras API i strony listy bez logowania jest przekrojowy i leży we wspólnym katalogu testów.

## Zależności

- **Źródła ofert**: ogłoszenia i ich wersje (przejściowo przez tabele), katalogi nazw źródeł i ocena kwalifikacji pracy zdalnej.
- **Dopasowanie**: zbiorczy odczyt podsumowań ocen dla listy i lista stanów oczekujących oceny.
- **Wspólna infrastruktura**: dostęp do bazy przez wspólny akcesor.

Trasy API ofert przekazują zapytanie do operacji modułu. Trasa listy dokłada do odpowiedzi stan synchronizacji źródeł i stan ocen dopasowania; do zadań `oferty-pracy-0mq.6`, `oferty-pracy-0mq.16` i `oferty-pracy-0mq.18` to składanie zostaje w trasie.

## Dalsze kroki

Najbliższa zmiana modułu to przejście na publiczny odczyt Źródeł w zadaniu `oferty-pracy-0mq.6`. Grupowanie ogłoszeń w oferty pracy pozostaje poza epikiem `oferty-pracy-0mq` i wymaga osobnego przygotowania.
