# Uzgodnione wymagania produktu

> **Materiał historyczny z początkowego wywiadu.** Późniejsze decyzje właściciela zastąpiły m.in. otwarte zapisy o stosie, budżecie i kopiach zapasowych. Aktualny szkic specyfikacji: [PRD → wymagania → projekt rozwiązania](../specs/pierwsza-wersja/README.md). Nie interpretować poniższych dawnych pytań jako ponownego otwarcia zamkniętych decyzji. Kopie wykonuje zewnętrzna usługa, nie aplikacja.

Dokument zapisuje wymagania potwierdzone podczas wywiadu projektowego. Właściciel potwierdził zakres produktu i przejście do specyfikacji oraz projektu technicznego. Dokument nie stanowi jeszcze kompletnej specyfikacji ani wyboru architektury technicznej.

## Przeznaczenie

System służy wyłącznie właścicielowi, bez obsługi innych użytkowników. Pomaga wyszukiwać pracę, zarządzać ofertami i rekrutacjami oraz przygotowywać się do rozmów.

Dane są przechowywane na komputerze właściciela lub jego VPS. Wybór miejsca uruchomienia pozostaje otwarty. Dopuszczalne jest przesyłanie potrzebnych fragmentów profilu, ofert i informacji o firmach do zewnętrznego AI, bez danych kontaktowych z CV i z kontrolą kosztów.

## Profil i zbieranie ofert

Profil powstaje na podstawie CV, uzupełnionego o preferencje i kryteria wykluczające. Posiadane umiejętności i kierunek poszukiwań są odrębnymi informacjami.

Proces obejmuje pobranie wszystkich ofert spełniających szerokie wymagania podstawowe, triage względem preferencji, a następnie dwa etapy researchu. Szczegółowe dopasowanie technologii ocenia triage. Brak informacji jest niewiadomą.

Potwierdzone wymiary filtrowania to technologie, widełki wynagrodzenia, lokalizacje, rodzaje kontraktu, wymiar godzin oraz poziom seniority. Konkretne wartości filtrów nie zostały jeszcze podane. Wcześniejsze ustalenia obejmują również tryb pracy jako kryterium podstawowe.

## Filtry i reguły dopasowania

Kryteria pobierania ofert, preferencje do oceny dopasowania i filtry przeglądania zapisanych danych są rozdzielone. Zmiana filtra widoku nie zmienia zakresu pobierania. Kryterium profilu może być wymaganiem koniecznym albo preferencją.

Oprócz podstawowych wymiarów system uwzględnia:

- Tryb pracy, w tym liczbę dni w biurze.
- Dostępność geograficzną, w tym możliwość pracy z Polski i wymagane pozwolenie na pracę.
- Specjalizację, np. backend, frontend, fullstack, platform lub data.
- Język pracy i wymagany poziom.
- Strefę czasową, wymagane godziny wspólnej pracy i dyżury.
- Typ firmy i projektu oraz preferowane lub wykluczone branże.
- Aktualność: datę publikacji, pierwszego wykrycia i stan aktywna/wygasła.

Lista zapisanych ofert umożliwia filtrowanie po ratingu i jego składowych, statusie decyzji właściciela, etapie rekrutacji, stanie researchu, firmie, źródle i własnych tagach.

Filtry technologii obsługują dowolną z wybranych, wszystkie wybrane oraz technologie wykluczone. Technologie wymagane w ofercie są odróżniane od opcjonalnych.

Wynagrodzenia uwzględniają walutę, okres rozliczenia i podstawę kwoty, np. brutto UoP albo netto B2B. Właściciel decyduje, czy uwzględniać oferty bez widełek.

## Triage

AI proponuje ocenę 0–100, uzasadnienie, mocne strony, braki i niewiadome. Właściciel może korygować rekomendację. Jego decyzja jest zapisywana osobno od oceny AI.

Wszystkie pobrane oferty pozostają dostępne niezależnie od wyniku triage. Oceny można łatwo przeglądać, sortować i filtrować.

Ocena łączna ma jawne składowe: technologie, doświadczenie, warunki i preferencje. Właściciel może zmieniać ich znaczenie. Kompletność danych jest pokazywana osobno; brak danych nie jest utożsamiany z niespełnieniem wymagania.

## Research

Research podstawowy uruchamia się automatycznie dla ofert zakwalifikowanych po triage. Próg kwalifikacji zostanie określony po obejrzeniu pierwszych ocen. Research pogłębiony jest uruchamiany na żądanie. Oba etapy można uruchamiać ręcznie dla dowolnej firmy lub oferty.

Research obejmuje działalność firmy, produkty i projekty, warunki i metody pracy, technologie oraz sygnały ryzyka. Zawiera źródła, daty oraz rozróżnienie faktów, opinii i niewiadomych. Informacje o firmie są wykorzystywane ponownie przy jej kolejnych ofertach.

Przygotowanie do rozmowy odnosi się do konkretnego stanowiska oraz zespołu lub projektu, jeśli są znane. Wskazuje tematy do przećwiczenia i pytania do rekrutera, z uzasadnieniem rekomendacji.

Wynik pogłębionego researchu obejmuje opis firmy i projektu, mapę technologii, priorytetową listę tematów do powtórzenia, propozycje pytań technicznych do ćwiczeń oraz pytania do firmy. Propozycje pytań mają uzasadniony związek ze stanowiskiem i nie są przedstawiane jako znane pytania z rzeczywistej rozmowy. Właściciel może uzupełniać przygotowanie informacjami od rekrutera.

## Oferty i firmy

System udostępnia pełną listę ofert z sortowaniem i filtrowaniem, listę firm, szczegóły oferty oraz szczegóły firmy. Firma pokazuje powiązane oferty, research i technologie ogólnie oraz per oferta.

Firma publikująca, firma zatrudniająca i klient są odrębnymi rolami, o ile dane pozwalają je ustalić. Technologii klienta nie przypisuje się pośrednikowi jako jego własnych.

Technologie wskazują źródło i zakres: konkretna oferta, inny projekt firmy lub przypuszczenie do potwierdzenia. Technologia z innej oferty nie staje się automatycznie wymaganiem dla rozpatrywanego stanowiska.

## Zarządzanie rekrutacjami

System obejmuje etapy od nowej oferty, rozważania i planowania aplikacji przez wysłanie aplikacji i kolejne rozmowy do decyzji, z możliwością odrzucenia lub wycofania na każdym etapie. Obsługuje notatki, terminy, kontakty do rekruterów i historię zmian. Rekrutacja może obejmować wiele rozmów i zadanie rekrutacyjne.

## Obsługa i automatyzacja

Głównym interfejsem jest aplikacja w przeglądarce, uruchamiana na komputerze właściciela albo VPS. Udostępnia tabele, filtry, szczegóły i zarządzanie rekrutacjami.

Pobieranie ofert i triage działają według harmonogramu, domyślnie raz dziennie, oraz na żądanie. Uruchomienie na komputerze zależy od jego dostępności; VPS umożliwia pracę niezależną od komputera właściciela.

Na start podsumowanie jest dostępne w aplikacji: nowe oferty, najlepsze dopasowania, zakończony research, nadchodzące rozmowy i błędy pobierania. Powiadomienia poza aplikacją są poza zakresem pierwszej wersji.

## Tożsamość i historia ofert

Ta sama oferta z kilku portali jest prezentowana jako jedna pozycja z wieloma źródłami. Niepewne podobieństwa pozostają osobnymi ofertami. Wygasłe ogłoszenia zachowują historię i notatki. Chwilowy błąd pobierania nie oznacza wygaśnięcia.

Po zmianie profilu można na żądanie ponownie ocenić pobrane oferty. Historia ocen i własne decyzje pozostają zachowane.

## Budżet

System ma ustawiany limit wydatków na AI i research. Po jego osiągnięciu płatne operacje są wstrzymywane, natomiast pobieranie dostępnych bezpłatnie ofert i przeglądanie bazy nadal działają. Oczekujące operacje można wznowić po zwiększeniu lub odnowieniu budżetu. Kwota zostanie ustalona przed podłączeniem płatnych usług.

## Prywatność i kopie zapasowe

Aplikacja jest dostępna wyłącznie właścicielowi, również w wariancie na VPS. Automatyczne kopie obejmują oferty, profil, research i historię rekrutacji. Miejsce przechowywania kopii zostanie wybrane przy ustalaniu hostingu.

## Zakres pierwszej wersji

Pierwsza działająca wersja obsługuje jedno źródło i cały proces od pobrania oferty do przygotowania do rozmowy. Kolejne źródła są dodawane pojedynczo po uruchomieniu działającego systemu.

Wywiad nie ustalił jeszcze konkretnego pierwszego źródła, wartości filtrów profilu, miejsca uruchomienia, miejsca kopii, kwot i okresów budżetowych ani szczegółowych wag oceny. Wybór stosu technicznego pozostaje otwarty.

## Ograniczenia przyjęte na początku wayfindingu

Pierwsze źródło ma dostarczać przede wszystkim oferty dostępne dla osób pracujących z Polski, również zdalnie. Pierwsze uruchomienie odbędzie się na komputerze właściciela, z możliwością późniejszego przeniesienia aplikacji i danych na VPS. Wybór konkretnego stosu technicznego nie jest narzucony; kryterium stanowi prostota utrzymania.

Roboczy limit projektowy wynosi 100 zł miesięcznie na AI i usługi researchu, niezależnie od ewentualnego kosztu VPS. Wymaga sprawdzenia wykonalności i nie stanowi zgody na zakup usług. Nie zostały jeszcze ustalone szczegółowe wagi ocen, wartości filtrów ani miejsce przechowywania kopii.
