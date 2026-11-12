# Zasady architektury i pisania kodu

Punkty wejścia aplikacji przekazują polecenia i zapytania do modułów przez ich publiczne operacje.

## Reguły zależności

1. **Tylko moduł będący właścicielem danych wykonuje operacje na tych danych.** Inne moduły, API, CLI i worker przekazują zapytanie lub polecenie przez publiczny interfejs właściciela. Właściciel odczytuje dane, sprawdza reguły, wykonuje operację i zwraca wynik albo zdefiniowany błąd. Zapytania do tabel, w tym złączenia, repozytoria, adaptery i schemat zapisu są wewnętrzne. W TypeScripcie publiczne operacje i ich kontrakty eksportujemy jawnie z `modules/<moduł>/index.ts`.

   - **Operacje są domyślnie wewnętrzne.** Przed dodaniem publicznej operacji wskazujemy konkretnego klienta spoza modułu i przypadek użycia, którego istniejący kontrakt nie obsługuje. Operacja wyraża cel klienta i udostępnia tylko potrzebne dane. Dopasowanie może odczytać aktywną zatwierdzoną wersję profilu wraz z jej identyfikatorem przez publiczny serwis Profilu. [Kontrakt Profilu zawodowego](../../modules/profile/README.md#publiczne-operacje)
   - **Każda publiczna operacja chroni niezmienniki modułu.** Moduł sprawdza dopuszczalność polecenia w aktualnym stanie i zabezpiecza sprawdzenie oraz zapis przed równoległą zmianą. Gdy polecenie opiera się na stanie odczytanym wcześniej przez klienta, podaje oczekiwaną rewizję. Jeśli warunki przestały być spełnione, moduł zwraca konflikt bez częściowego zapisu. Przy zatwierdzeniu profilu Profil sprawdza rewizję szkicu, tworzy zatwierdzoną wersję i ustawia ją jako aktywną w jednej transakcji.

2. **Widoki składają dane przez publiczne operacje odczytu.** Każdy moduł udostępnia dane potrzebne do konkretnego widoku i sam wylicza wartości wynikające z jego reguł. Widok łączy odpowiedzi po identyfikatorach oraz odpowiada za prezentację, filtrowanie i sortowanie. Lista Ofert przekazuje identyfikatory ogłoszeń do zbiorczego odczytu Dopasowania. Dopasowanie zwraca rating, kompletność i aktualność oceny, a Oferty korzystają z ratingu przed sortowaniem i paginacją.

3. **Przypadek użycia wyznacza granicę transakcji.** Operacja realizująca przypadek użycia określa, które zmiany muszą zostać zatwierdzone albo wycofane razem, i koordynuje transakcję. Jeśli uczestniczy w niej kilka modułów, każdy zapisuje własne dane przez publiczną operację w tym samym kontekście transakcji. Mechanizm transakcji należy do wspólnej infrastruktury. [Martin Fowler, Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) · [Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)

## Reguły struktury kodu

### Katalog modułu

Najmniejszy moduł ma opis odpowiedzialności, publiczne wejście i plik z implementacją operacji. Nazwa pliku mówi, co można zrobić, np. `read-active-profile.ts`.

```text
modules/<moduł>/
├── README.md
├── index.ts
└── <nazwa-operacji>.ts
```

- **`README.md`** opisuje główny cel modułu i dane, za które odpowiada. Istotne warunki użycia publicznych operacji opisujemy przy ich kontraktach.
- **`index.ts`** jawnie eksportuje operacje i typy potrzebne klientom modułu. Klienci importują stąd, a kod wewnętrzny korzysta bezpośrednio z plików implementacji. Typy wejścia i wyniku trzymamy przy operacji lub w osobnym pliku, jeśli korzysta z nich kilka operacji.
- **Plik operacji** prowadzi przypadek użycia od przyjęcia polecenia lub zapytania do wyniku. Określa też, które zmiany muszą zostać zapisane razem. Powiązane operacje mogą współdzielić plik nazwany według ich odpowiedzialności.

Podkatalog dodajemy, gdy jest co w nim zebrać i można jasno nazwać jego odpowiedzialność.

| Katalog | Kiedy pomaga | Przykład |
| --- | --- | --- |
| `operations/` | Moduł ma kilka przypadków użycia i warto zebrać ich punkty wejścia w jednym miejscu. | `confirm-profile.ts`, `apply-cv-proposal.ts` |
| `domain/` | Moduł ma reguły, które można wyrazić na podstawie przekazanych danych, bez odczytu bazy lub wywołania usługi. | Obliczenie ratingu z ocen i wag, sprawdzenie poprawności widełek wynagrodzenia |

`infrastructure/` zawiera kod, który łączy operacje modułu z bazą danych, usługami zewnętrznymi i mechanizmami uruchamiania. Dodajemy podkatalogi odpowiadające temu, czego moduł używa.

```text
infrastructure/
├── persistence/   # zapytania, zapis i mapowanie danych z bazy
├── adapters/      # integracje i implementacje portów
├── http/          # kontrolery HTTP
├── worker/        # obsługa zadań z kolejki
└── cli/           # polecenia CLI
```

Operacja łączy odczyt, reguły domeny i zapis. Reguły domeny pracują na przekazanych danych. Kod w `persistence/` zna schemat danych własnego modułu. Adapter tłumaczy dane na kontrakt zdefiniowany przy operacji, która z niego korzysta.

Kontroler, handler workera lub polecenie CLI przekazuje dane do publicznej operacji modułu i obsługuje jej wynik. Gdy kilka modułów zapisuje dane w jednej transakcji, operacja koordynująca przekazuje wspólny kontekst ich publicznym operacjom. Każdy moduł wykonuje własny zapis.

### Operacja modułu prowadzi cały przypadek użycia

Publiczna operacja odpowiada za pełny przebieg konkretnego polecenia. Odczytuje potrzebne dane, sprawdza warunki, wykonuje zmianę i zwraca wynik. Punkt wejścia aplikacji tłumaczy żądanie na polecenie i wynik na odpowiedź.

Przy zastosowaniu propozycji z CV trasa przekazuje wybór pozycji i oczekiwaną rewizję szkicu. Profil odczytuje propozycję, sprawdza rewizje i zapisuje szkic w ramach jednej operacji. Dzięki temu każdy punkt wejścia stosuje te same reguły. [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html)

### Wymienni wykonawcy korzystają ze wspólnego kontraktu

Port opisuje, czego potrzebuje przypadek użycia. Adapter realizuje ten kontrakt przy pomocy konkretnej technologii. Implementację adaptera wybieramy w miejscu, które składa zależności. Kod przypadku użycia korzysta z kontraktu portu.

W Źródłach port konektora przyjmuje zakres i dostarcza ogłoszenia oraz informację o kompletności pobrania. Adapter obsługuje szczegóły portalu, a operacja wykonania przebiegu używa tego samego portu do pobrania danych i ustalenia końcowego stanu. [Ports and Adapters](https://alistair.cockburn.us/hexagonal-architecture) · [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

### Dane zewnętrzne tłumaczymy przy integracji

Warstwa antykorupcyjna zamienia model zewnętrznego systemu na pojęcia używane w aplikacji. Przy integracji portalu tłumaczenie należy do konektora. Kontrakt Źródeł określa znaczenie pól, a odbiorcy korzystają z tych znaczeń przy stosowaniu własnych reguł.

Jeśli portal odróżnia widełki pracodawcy od własnego szacunku, konektor przekazuje kwotę wraz z pochodzeniem. Dopasowanie stosuje jedną regułę porównania wynagrodzenia na podstawie pochodzenia kwoty. Zmiana pola w odpowiedzi portalu dotyczy wtedy kodu tłumaczenia w konektorze. [Eric Evans, Domain-Driven Design Reference, s. 34](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)

### Obiekt wartości grupuje dane, które mają wspólne znaczenie

Obiekt wartości reprezentuje pojęcie przez jego dane i reguły. Dwie takie wartości są równe, jeśli mają te same istotne cechy. Poprawność sprawdzamy przy tworzeniu wartości, a zmiana tworzy nową wartość.

Widełki wynagrodzenia obejmują granice kwoty, walutę, okres, podstawę i rodzaj kontraktu. Reguła tworzenia widełek sprawdza między innymi kolejność granic, jeśli podano obie. Kod porównujący wynagrodzenia otrzymuje całe widełki, dzięki czemu może sprawdzić ich porównywalność. [Eric Evans, Domain-Driven Design Reference, s. 12](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)

### Agregat chroni stan, który musi zmieniać się razem

Agregat grupuje dane, dla których określone warunki muszą być spełnione po każdej zmianie. Zmiany przechodzą przez główny obiekt agregatu, który pilnuje tych warunków. Zakres agregatu wyznacza stan potrzebny do sprawdzenia reguł i wykonania zmiany. Pełną historię można pobierać osobno.

Przy zatwierdzaniu profilu nowa wersja i wskazanie jej jako aktywnej są częścią jednej zmiany. Operacja zatwierdzenia sprawdza oczekiwaną rewizję szkicu i zapisuje oba elementy atomowo. [Eric Evans, Domain-Driven Design Reference, s. 16](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)

### Reguły obliczeniowe oddzielamy od odczytu i zapisu

Funkcja obliczeniowa otrzymuje dane potrzebne do podjęcia decyzji i zwraca wynik. Kod realizujący przypadek użycia pobiera wejście, wywołuje tę funkcję i decyduje o zapisie. To podział znany jako funkcyjny rdzeń i imperatywna otoczka.

Funkcja licząca rating przyjmuje oceny kryteriów i wagi. Zwraca rating i kompletność, które można sprawdzić na przekazanych danych. Operacja zapisująca ocenę odpowiada za odczyt wag i utrwalenie wyniku. [Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell)

### Funkcja opisuje kroki na jednym poziomie szczegółowości

W funkcji prowadzącej przypadek użycia widać kolejność działań istotnych dla jego wyniku. Szczegół wydzielamy, gdy nazwana operacja pozwala zrozumieć krok bez czytania jej implementacji.

Zatwierdzenie profilu można opisać jako sprawdzenie rewizji, zapis zatwierdzonej wersji i jej aktywację. Instrukcje SQL i mapowanie wierszy należą do kodu wykonującego te kroki. [Clean Code, rozdział Functions](https://www.informit.com/store/clean-code-a-handbook-of-agile-software-craftsmanship-9780132639408)

## Zasady pisania kodu

- **Nazwy opisują operację i przedmiot.** `enqueueMatching`, `publishAiRating` i `readRatings` wskazują, które wywołanie zleca pracę, zapisuje wynik lub czyta historię. Nazwy typów i statusów opieramy na pojęciach ze [słownika domeny](../../GLOSSARY.md).
- **Dane wejściowe walidujemy przy wejściu.** Trasa sprawdza kształt żądania HTTP, adapter sprawdza odpowiedź zewnętrzną, moduł pilnuje reguł domeny. Po walidacji przekazujemy typowany wynik. Na przykład poprawny JSON oceny nadal wymaga sprawdzenia dowodów względem zapisanej wersji profilu i rewizji ogłoszenia.
- **Diagnostyka zawiera tylko dane potrzebne do ustalenia, co się stało.** Zapisujemy stan, przyczynę i identyfikatory pozwalające powiązać zdarzenia. Komunikaty diagnostyczne i logi pomijają dane wrażliwe i sekrety. [OWASP, Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude)
- **Nowa warstwa ma określoną odpowiedzialność.** Wydzielamy ją, jeśli ukrywa regułę lub szczegóły wykonania, które mogą się różnić między wykonawcami.
