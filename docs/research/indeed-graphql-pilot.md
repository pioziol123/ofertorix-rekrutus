# Indeed GraphQL — kontrola dostępu i adaptera

Data: 2026-11-03. Obie próby wykonano w kontenerze worker pod wspólną blokadą `serialized_import`; każde uruchomienie czekało co najmniej sekundę po uzyskaniu blokady. Bez przekierowań, ponowień, proxy ani zapisu ofert do bazy.

1. Bezpośredni POST GraphQL: zapytanie PHP, Polska, limit odpowiedzi 5, polskie locale, lokalna selekcja pól. Jedno żądanie: HTTP 200, JSON, zero błędów GraphQL, pięć wyników i pięć opisów, czas 0,24 s.
2. Istniejący `jobspy.integration.collect_indeed`: zapytanie Senior PHP, Polska, żądane 5 przetworzonych ogłoszeń, polityka maksymalnie jedno żądanie i jedna próba. Wynik `limited` / `result_limit`, jedno żądanie, pięć przetworzonych ogłoszeń, pięć URL, zero brakujących opisów, zero pominiętych rekordów i ostrzeżeń. Wszystkie tytuły zawierały PHP i Senior; dwa wskazywały jednocześnie poziom Regular. Ten adapter prosi źródło o stronę do 100 rekordów, a następnie ogranicza wynik do pięciu.

Wniosek: GraphQL i lokalny adapter zadziałały dla tej ograniczonej próby z bieżącego środowiska; HTTP 403 dotyczył wcześniej badanego HTML. Nie wykazano kompletności polskiego rynku, trwałości dostępu, poprawności wszystkich danych ani możliwości pracy z Polski dla każdej oferty. Wyniki zapytania nie są kwalifikacją senior PHP. Próby nie włączyły Indeed w aplikacji, nie zmieniły runnera wskazującego na HTML i nie wykonały pilota zapisu przez kolejkę.
