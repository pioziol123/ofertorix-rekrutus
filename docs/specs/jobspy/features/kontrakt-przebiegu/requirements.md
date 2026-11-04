# Kontrakt przebiegu Indeed — requirements

Wybrane do realizacji 2026-11-02; [PRD](../../PRD.md), zakres diagnostyki i strukturalnego eksportu. Jeden odczyt dotyczy jednego jawnego źródła i zapytania; pierwsza wersja wyłącznie Indeed.

- **R-K01:** wynik wskazuje źródło, parametry niezbędne do interpretacji wyszukiwania, czas rozpoczęcia/zakończenia, wersję kontraktu i forka. Nie zawiera konfiguracji proxy, sekretów ani profilu właściciela.
- **R-K02:** odczyt rozróżnia zakończenie zapytania, wynik ograniczony/niepewny, wynik częściowy oraz niepowodzenie. Powód limitu, braku postępu, błędu strony i niepoprawnych rekordów jest odróżnialny. Zakończenie zapytania nie dowodzi pełnego pokrycia źródła.
- **R-K03:** poprawna odpowiedź bez wyników daje zakończony odczyt z pustą listą; blokada/błąd przed pierwszą ofertą daje niepowodzenie. Błąd po poprawnych ofertach zachowuje je i daje wynik częściowy. Pominięte błędne rekordy są liczone; nie zakładamy, że nieznana liczba pozostałych wyników wynosi zero.
- **R-K04:** brak opisu jest jawny per oferta oraz podsumowany. Jeżeli klient żąda filtra, którego ten kontrakt nie obsługuje, wejście jest odrzucane przed siecią zamiast cichego ignorowania.
- **R-K05:** strukturalny JSON zachowuje lokalizację jako obiekt, listy jako listy, datę jako ISO, niewiadome jako null oraz nowe informacje o płacach. Normalizowany rekord nie udaje oryginalnej odpowiedzi portalu.
- **R-K06:** nieoczekiwany błąd nie przenosi do wyniku/logów surowej odpowiedzi, tokenów ani treści wyjątków transportu. Standardowy interfejs `scrape_jobs` i jego istniejące pola pozostają dostępne; nowy kontrakt jest dodatkowym wejściem bibliotecznym.

Odbiór na syntetycznych stronach obejmuje: pusty zbiór, limit wyników, błąd pierwszej/kolejnej strony, błędny rekord pomiędzy poprawnymi, brak postępu kursora, brak opisu i eksport zagnieżdżonych pól. Nie wykonujemy prób live. Nie wdrażamy tu zapisu do Postgresa ani automatycznego wygaszania ofert.
