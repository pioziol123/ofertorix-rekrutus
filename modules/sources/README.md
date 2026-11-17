# Źródła ofert

Moduł Źródła ofert odpowiada za pozyskiwanie ogłoszeń z zewnętrznych źródeł oraz zachowanie ich treści, pochodzenia, historii zmian i informacji o dostępności. Dostarcza pozostałym częściom systemu dane do przeglądania ofert i ich oceny. Poniższy opis określa odpowiedzialności modułu i zasady interpretowania pobranych wyników.

## Co obejmuje moduł

Podstawowym obiektem jest **ogłoszenie źródłowe**, czyli konkretny wpis opublikowany w jednym źródle. Ta sama rekrutacja może być ogłaszana w kilku miejscach. Każde z tych ogłoszeń ma własną treść, link, historię i dostępność; zmiana jednego nie przesądza o stanie pozostałych.

Moduł udostępnia katalog obsługiwanych źródeł, pozwala zlecić pobranie ogłoszeń oraz sprawdzić jego postęp i wynik. Przechowuje znalezione ogłoszenia i umożliwia odczyt ich aktualnej treści oraz wcześniejszych wersji.

Powiązanie kilku ogłoszeń z jedną ofertą pracy i prezentacja tej oferty należą do modułu Oferty. Moduł Dopasowanie korzysta z treści ogłoszeń przy ocenie zgodności z profilem zawodowym, a moduł Firmy przy wiązaniu ogłoszeń z organizacjami. Źródła ofert dostarczają im informacje o publikacjach; nie rozstrzygają za nie oceny oferty ani tożsamości pracodawcy.

## Jak przebiega pobieranie

Pobieranie dotyczy wybranego źródła i ustalonego **zakresu**. Zakres określa, jakie ogłoszenia mają zostać sprawdzone, na przykład przez wybór technologii, poziomu doświadczenia i ograniczeń liczby wyników. Jest ustalany dla danego uruchomienia, tak aby jego wynik można było odnieść do tego, co rzeczywiście miało zostać pobrane.

**Przebieg synchronizacji** to jedno wykonanie takiego pobierania. Wyniki mogą przychodzić w wielu porcjach. Moduł zachowuje poprawne ogłoszenia w miarę ich otrzymywania, dlatego późniejszy błąd nie przekreśla już zebranych danych.

| Stan przebiegu | Znaczenie |
| --- | --- |
| Oczekujący | Pobranie zostało zlecone i czeka na rozpoczęcie. |
| W trakcie | Trwa pobieranie i zapisywanie wyników. |
| Kompletny | Sprawdzono cały ustalony zakres. |
| Częściowy | Uzyskano użyteczne wyniki, ale nie sprawdzono całego zakresu lub nie udało się potwierdzić kompletności. |
| Nieudany | Nie udało się uzyskać użytecznych wyników. |

Kompletny przebieg nie musi oznaczać pobrania wszystkich ogłoszeń istniejących w danym źródle. Kompletność odnosi się do ustalonego zakresu, a nie do całego rynku ofert. Wynik ograniczonego wyszukiwania może być kompletny, lecz nadal nie wystarczać do ustalenia, że inne ogłoszenie zostało usunięte.

Źródła różnią się sposobem udostępniania danych i informacjami, które przekazują. Moduł uwzględnia te różnice podczas pobierania, ale udostępnia ogłoszenia w spójnej postaci, zachowując ich pochodzenie. Jeśli źródło nie dostarcza jakiejś informacji, jej brak pozostaje niewiadomą.

## Tożsamość i historia ogłoszenia

Ogłoszenie rozpoznawane jest na podstawie źródła i identyfikatora nadanego mu w tym źródle. Ponowne pobranie tego samego ogłoszenia, także w innym zakresie wyszukiwania, aktualizuje istniejący zapis.

Gdy zmienia się treść ogłoszenia, moduł zachowuje nową wersję, nie usuwając poprzednich. Ponowne pobranie identycznej treści nie tworzy kolejnej wersji. Dzięki temu historia pokazuje zmiany publikacji, a nie samą częstotliwość pobierania.

Niezależnie od zmian treści zapisywana jest **obserwacja**: informacja, że konkretne ogłoszenie zostało znalezione w danym przebiegu. Ogłoszenie może więc zostać ponownie zaobserwowane bez powstania nowej wersji. Obserwacje pozwalają później ustalić, które znane ogłoszenia pojawiły się w wynikach synchronizacji.

## Jak ustalana jest dostępność

Dostępność dotyczy konkretnego ogłoszenia w jego źródle. Ustalamy ją na podstawie informacji o znalezionym ogłoszeniu albo, pod określonymi warunkami, jego braku w wynikach. Te dwie sytuacje wymagają różnych podstaw do podjęcia decyzji.

### Informacja o znalezionym ogłoszeniu

Znalezienie ogłoszenia w wynikach aktywnych ofert pozwala potwierdzić jego dostępność już podczas pobierania, również gdy cały przebieg zakończy się częściowo. Nie trzeba czekać na pozostałe ogłoszenia, aby wykorzystać informację, którą źródło już przekazało.

Samo zwrócenie treści przez źródło nie zawsze oznacza jednak, że ogłoszenie jest nadal aktywne. Źródło może udostępniać również publikacje zamknięte albo takie, których termin ważności już minął. Dlatego wraz z obserwacją trzeba uwzględniać podany status i datę ważności. Obecność ogłoszenia w odpowiedzi nie unieważnia informacji o jego wygaśnięciu.

Informacje odnoszące się bezpośrednio do konkretnego ogłoszenia nie wymagają kompletnej synchronizacji. Jeżeli źródło podaje termin ważności, jego upływ pozwala stwierdzić wygaśnięcie. Jeżeli nie podaje ani terminu, ani statusu zamknięcia, nie należy dopowiadać tych informacji.

### Brak ogłoszenia w wynikach

Nieznalezienie ogłoszenia nie jest samo w sobie dowodem niedostępności. Mogło ono znajdować się w niepobranej części wyników, poza zakresem wyszukiwania albo poza limitem odpowiedzi źródła.

Dla źródeł, które pozwalają wyciągać wnioski z nieobecności ogłoszenia, moduł wykonuje osobną ocenę po zakończeniu pobierania. Oznaczenie ogłoszenia jako niedostępnego wymaga łącznie:

- potwierdzenia kompletności przebiegu;
- możliwości wnioskowania o niedostępności z braku w wynikach danego źródła;
- porównania ogłoszeń i obserwacji dotyczących tego samego źródła oraz zakresu.

O tym, czy ogłoszenie należało do zakresu, decyduje historia jego obserwacji w przebiegach tego zakresu, a nie zakres, w którym widziano je ostatnio. Ogłoszenie widziane wcześniej w zakresie, a nieobecne w kompletnym przebiegu tego zakresu, staje się niedostępne. Późniejsza obserwacja w dowolnym zakresie przywraca jego dostępność.

Jeżeli którykolwiek z tych warunków nie jest spełniony, brak obserwacji pozostawia dotychczasową dostępność ogłoszenia bez zmian. Dotyczy to zarówno częściowego pobrania, jak i kompletnego wyszukiwania, którego wyniki nie są podstawą do wykrywania usuniętych ogłoszeń.

### Przykład: przerwane pobieranie

Załóżmy, że ogłoszenie A było wcześniej niedostępne, a ogłoszenie B dostępne. Podczas kolejnego pobierania źródło zwróciło A jako aktywne, lecz pobieranie przerwało się przed dotarciem do wszystkich wyników.

A może ponownie zostać oznaczone jako dostępne: mamy nową informację o jego obecności. B zachowuje dotychczasowy stan, ponieważ nie wiemy, czy zniknęło, czy znajdowało się w niepobranej części. Dopiero pełne sprawdzenie odpowiedniego zakresu, dla źródła dopuszczającego takie wnioskowanie, pozwala uznać brak B za podstawę niedostępności.

## Jak interpretować wynik

Moduł dostarcza treść ogłoszeń wraz z ich historią oraz informacją o tym, co udało się sprawdzić. Wyniki częściowego pobierania pozostają użyteczne, ale nie pozwalają wnioskować o losie ogłoszeń, których nie znaleziono.

Niedostępność w źródle, wygaśnięcie ogłoszenia i zakończenie rekrutacji to odrębne informacje. Usunięcie lub wygaśnięcie jednej publikacji nie przesądza o stanie innych ogłoszeń tej samej oferty ani o zakończeniu aplikacji użytkownika. Historia ogłoszenia pozostaje dostępna również wtedy, gdy sama publikacja przestaje być aktywna.
