# Kontrola żądań Indeed — requirements

Wybrane 2026-11-02, [PRD](../../PRD.md). Zakres: nowe wejście integracji Indeed, bez zmiany zachowania pozostałych źródeł.

- **R-H01:** wywołujący określa skończone limity liczby prób HTTP, czasu przebiegu, czasu pojedynczego żądania i ponowień oraz minimalny odstęp. Niepoprawne i nieograniczone wartości są odrzucane przed siecią.
- **R-H02:** każda próba, również ponowienie, zużywa wspólny limit. Po osiągnięciu limitu lub czasu nie rozpoczyna się następne żądanie. Zapisane wyniki pozostają dostępne z oznaczeniem ograniczenia. Oczekiwanie nie przedłuża celowo przebiegu ponad budżet.
- **R-H03:** ponawiane są jedynie timeouty/błędy połączenia oraz odpowiedzi 429/500/502/503/504. Inne błędy, w tym 403, nie wywołują automatycznej rotacji IP ani pętli ponowień. Maksymalna liczba prób obejmuje pierwsze żądanie.
- **R-H04:** poprawne Retry-After (sekundy lub data HTTP) jest respektowane. Jeśli oczekiwanie nie mieści się w pozostałym budżecie, przebieg kończy się z jawnym powodem; nie ignorujemy nagłówka. Brak lub niepoprawny nagłówek uruchamia ograniczony backoff.
- **R-H05:** wynik wskazuje liczbę wykonanych prób i powód zatrzymania. Transport nie dodaje sekretów ani treści wyjątku do wyniku. Testy zegara i transportu nie wykonują rzeczywistych opóźnień ani połączeń.

Limit czasu jest kontrolą kooperacyjną: żądania dostają timeout ograniczony pozostałym budżetem. Twarde zakończenie procesu przy zawieszonym DNS/systemie będzie odpowiedzialnością późniejszego adaptera aplikacji. Nie obiecujemy takiej gwarancji na poziomie pojedynczej sesji bibliotecznej.

## Potwierdzona zgoda i limit — 2026-11-02

Właściciel potwierdził uzyskanie zgody na scraping LinkedIn i Indeed z limitem jednego query na sekundę. Jest to deklaracja właściciela, bez kopii warunków w repo. Konserwatywnie limit obejmuje wszystkie żądania HTTP: wyszukiwanie, strony wyników, szczegóły i ponowienia, łącznie dla obu portali.

- **R-H06:** aplikacja serializuje wszystkie przebiegi JobSpy na jednym współdzielonym wolumenie. W przebiegu zachowuje odstęp co najmniej 2 s; między przebiegami co najmniej 1 s, także po błędzie lub zabiciu poprzedniego procesu. Brak dostępu do blokady uniemożliwia połączenia.
- **R-H07:** LinkedIn można aktywować ręcznie po zapisaniu potwierdzenia. Zgoda na scraping Indeed odblokowuje planowany adapter HTML; nie aktywuje obecnego GraphQL. Brak harmonogramu pozostaje bez zmian.
