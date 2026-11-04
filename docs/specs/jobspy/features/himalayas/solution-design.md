# Himalayas — rozwiązanie pilota

2026-11-03. Pokrywa [R-H1–5](requirements.md). Parametry, granice i statusy poniżej definiują zakres implementacji; nie jest to wdrożenie harmonogramu ani rozszerzenie kontraktu JobSpy.

`lib/sources/himalayas.ts` obsługuje publiczny JSON bez klucza i bez Python. Search używa stron od 1, po 20 rekordów; nie stosuje kursora browse. Walidujemy envelope, pozycję strony i licznik, pojedyncze rekordy osobno. `guid` i `applicationLink` muszą być HTTPS na himalayas.app, bez loginu/hasła i nietypowego portu. Zachowujemy link aplikowania dokładnie jak w API. Nie odczytujemy stron HTML pracodawców ani ofert.

Normalizacja korzysta z istniejącego kształtu `Offer` i `saveOffers`, bez podszywania się pod adapter JobSpy. Surowy rekord w `sourceRecord`; `validFrom=null`, `sourceUpdatedAt` z pubDate, `validTo` z expiryDate. Płace z rzeczywistym okresem (nieobsługiwany fortnightly pozostaje surowy, okres znormalizowany null), origin unknown. Lista krajów jest zachowana; brak ograniczeń oznacza worldwide tylko przy jawnej pustej tablicy. Dopasowanie PHP i senior pozostaje do kwalifikacji, nawet jeśli filtr portalu przyjął Senior.

`lib/sources/himalayas-sync.ts` jest ręcznym wykonawcą pilota, uruchamianym przez `scripts/himalayas-sync.ts`, bez kolejki i automatycznych ponowień. Osobna sesyjna blokada PostgreSQL serializuje ręczne przebiegi. Tworzymy istniejący scope i run ze statusem running. Każdą stronę zapisujemy transakcyjnie. Przerwany poprzedni run oznaczamy failed/partial dopiero pod blokadą. Status complete oznacza ukończenie paginacji konkretnego zapytania, nie pełny rynek. Limit, zmiana paginacji, odrzucone rekordy, duplikaty, brak opisu lub błąd po zapisaniu rekordów dają partial. Brak poprawnej strony i błąd daje failed. Nigdy nie oznaczamy niewidzianych ogłoszeń jako unavailable.

Żądania mają timeout 20 s, redirect error i brak retry. W szczególności 429 kończy przebieg z metadanymi Retry-After, bez wcześniejszego ponowienia. Maksymalnie 5 stron/100 kandydatów i 120 s na sieć jednego przebiegu. Blokada bazy i sekunda przed pierwszym odczytem zapewniają odstęp między kolejnymi procesami. Błąd bazy nie może ujawnić surowej odpowiedzi ani danych połączenia.

Lista korzysta z dotychczasowego `projectOffer`, z dodaną jawną etykietą Himalayas i niewiadomymi kwalifikacji. Widoczny link źródłowy wskazuje niezmieniony applicationLink. Nie dodajemy źródła do katalogu JobSpy.

Weryfikacja: niezależny tester adaptera, błędów HTTP i paginacji, projekcji oraz zapisów w izolowanym schemacie Postgresa. Pilot na działającej bazie, raport z statusu i liczby rekordów, bez automatycznej analizy AI. Po pilocie osobne zadanie na kolejkę, kontrolę aktualności i ewentualny harmonogram.
