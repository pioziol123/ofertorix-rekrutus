# AI

Docelowa architektura modułu `modules/ai/`. Moduł przyjmuje zlecenie wykonania AI i udostępnia jego stan oraz wynik przez kontrakt niezależny od dostawcy. Odpowiada za konfigurację wykonawców, kolejkę, obsługę przerwanych wykonań i wspólny budżet usług płatnych. [Mapa modułów](../../docs/architecture/moduly.md) · [Wymagania przekrojowe](../../docs/specs/lokalne-ai/requirements.md)

## Podział odpowiedzialności

| Część | Odpowiedzialność |
| --- | --- |
| Moduł zlecający | Przygotowuje potrzebne dane i wiąże zlecenie z ich wersją. Sprawdza wynik według własnych reguł i decyduje, czy można zapisać lub opublikować rezultat domenowy. |
| Warstwa integrująca | Przekłada konkretny przypadek użycia na instrukcję i schemat odpowiedzi. Korzysta z publicznych operacji AI i przekazuje modułowi zlecającemu ujednolicony stan oraz wynik w ustalonym formacie. |
| Moduł AI | Dobiera skonfigurowanego wykonawcę, utrwala konfigurację, zarządza stanem wykonania i rozlicza użycie. Udostępnia wynik do walidacji domenowej. |
| Adapter wykonawcy | Tłumaczy żądanie, odpowiedź, błędy i dane o użyciu. Obsługuje protokół wykonawcy, np. cykl partii albo cykl sesji agenta. |

Moduł AI zapisuje stan wykonania, użycie i koszt. Wynik wykonania jest wejściem do operacji modułu zlecającego, który stosuje własne warunki zapisu i publikacji. Stan wykonania, rozliczenie i decyzja o przyjęciu treści są odrębne.

## Publiczne operacje

| Operacja | Kontrakt |
| --- | --- |
| Zlecenie wykonania | Przyjmuje typ zadania, identyfikator operacji domenowej i przygotowane wejście. Zwraca identyfikator wykonania i jego początkowy stan albo zdefiniowany błąd. |
| Odczyt wykonania | Udostępnia stan, wynik w ustalonym formacie, użycie, koszt oraz przyczynę błędu lub oczekiwania. Odczyt historii pozwala odróżnić wykonania tej samej operacji. |
| Polecenia dotyczące wykonania | Umożliwiają sprawdzenie, zatrzymanie, pominięcie, wznowienie lub ponowienie zgodnie z możliwościami wykonawcy i stanem wykonania. Przyjęcie polecenia oznacza zapis intencji. Potwierdzony skutek jest widoczny w stanie wykonania. |
| Odczyt budżetu | Udostępnia limit okresu, kwoty zarezerwowane i rozliczone oraz środki dostępne dla nowych zleceń. |

Publiczne operacje ukrywają kolejkę, protokół dostawcy i sposób zapisu stanu. Operacja domenowa ma własny identyfikator. Każde jej wykonanie ma osobny identyfikator, a płatna próba ma osobny zapis rozliczenia.

## Sposoby wykonania

| Sposób | Przebieg |
| --- | --- |
| Bezpośrednie wywołanie modelu | Wykonawca wysyła jedno żądanie i odbiera odpowiedź, np. z OpenAI Responses API albo Ollamy. Dla klienta modułu wykonanie ma identyfikator i stan. |
| Partia u dostawcy | Wykonawca wysyła partię, sprawdza jej stan i przypisuje odebrane wyniki do poszczególnych wykonań. Poprawny wynik jednej pozycji można odebrać także wtedy, gdy inna pozycja zakończy się błędem. Przykładem jest OpenAI Batch API. |
| Sesja agenta | Wykonawca zarządza sesją, obserwuje jej postęp i zbiera wynik oraz materiały z udostępnionych narzędzi. Agent prowadzi pętlę pracy, a dozwolone narzędzia zależą od zadania. Docelowy lokalny wykonawca korzysta z OpenCode i Ollamy. |

Konfiguracja określa dopuszczalne sposoby wykonania i wybór modelu dla typu zadania. Przy zleceniu moduł utrwala wejście, wersję instrukcji i schematu oraz ustawienia wykonawcy i ewentualnego cennika. Oczekujące wykonanie zachowuje tę migawkę po zmianie konfiguracji. Sekrety są pobierane z konfiguracji wykonawczej. Niedostępny wykonawca lub brak wymaganej zdolności daje jawny stan.

## Stan i ponowienia

- **Wspólna kolejka lokalna.** Wszystkie lokalne wykonania korzystają z jednego slotu w instalacji. Slot pozostaje zajęty podczas pracy, interwencji, oczekiwania na potwierdzenie zatrzymania i przy nieznanym stanie. Zwolnienie wymaga potwierdzenia zakończenia konkretnego wykonania.
- **Odzyskanie pracy.** Po przerwaniu moduł sprawdza istniejące wykonanie i wznawia odbiór stanu lub wyniku, jeśli pozwala na to wykonawca. Niepewną wysyłkę zapisuje jako stan wymagający rozstrzygnięcia.
- **Wznowienie i ponowienie.** Wznowienie kontynuuje to samo wykonanie. Jawne ponowienie tworzy nowe wykonanie z zapisaną migawką wejścia i ustawień. Poprzedni wynik pozostaje w historii, a poprzednie wykonanie traci możliwość publikacji. Nowe dane lub ustawienia wymagają nowego zlecenia.
- **Wynik wykonania i wynik domenowy.** Zakończenie pracy wykonawcy pozwala odebrać odpowiedź. Moduł zlecający sprawdza, czy odpowiedź należy do bieżącego wykonania, czy wersja wejścia nadal pozwala ją zastosować i czy treść spełnia reguły domenowe.

[Kontrakty kolejki, sesji i poleceń](../../docs/specs/lokalne-ai/kontrakty-runtime.md)

## Budżet i rozliczenie

- **Rezerwacja.** Przed uruchomieniem płatnej próby AI rezerwuje środki ze wspólnego budżetu na podstawie zapisanej konfiguracji kosztu. Zlecenie bez dostępnych środków czeka na budżet.
- **Rozliczenie.** AI rozlicza próbę na podstawie potwierdzonego użycia. Odrzucenie treści przez moduł zlecający nadal pozwala rozliczyć poniesiony koszt. Nieznany koszt pozostaje zarezerwowany do wyjaśnienia.
- **Wykonanie lokalne.** Lokalna inferencja ma zerowy koszt API i jest dostępna przy wyczerpanym płatnym budżecie. Płatne narzędzie użyte w lokalnym zadaniu wymaga rezerwacji. Nieznane zużycie pozostaje niewiadomą.

Historia wykonania wiąże stan, przyczynę, wynik, użycie i artefakty z jego identyfikatorem. Komunikaty diagnostyczne zawierają tylko potrzebne identyfikatory i przyczyny. Treść wejścia, surowe odpowiedzi i materiały narzędzi mają osobny dostęp przez historię wykonania zgodnie z kontraktem danego sposobu pracy.
