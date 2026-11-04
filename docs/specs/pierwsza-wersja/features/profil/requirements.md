# Profil zawodowy i kryteria — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **dopracowany zakres bieżącego etapu do przeglądu**, 2026-11-01. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-01, R-02 i odpowiadających im AC. Powiązania: [dopasowanie](../dopasowanie/requirements.md), [pobieranie](../pobieranie/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-01 — profil zawodowy

Profil powstaje na podstawie CV, można go uzupełniać i poprawiać. Oddziela posiadane umiejętności/doświadczenie od kierunku zawodowego, preferencji i wymagań koniecznych. Zachowuje wersje użyte do ocen. Właściciel może wgrać CV w PDF lub DOCX albo wkleić tekst. System tworzy propozycję profilu, którą właściciel przegląda, poprawia i zatwierdza przed pierwszą oceną ofert. Preferencje i kierunek rozwoju uzupełnia osobno.

**AC-01:** po poprawieniu profilu nowa ocena wskazuje nową wersję, a poprzednia nadal wskazuje swój stan wejściowy. Brak technologii w CV jest niewiadomą, nie potwierdzeniem nieznajomości. Właściciel może na żądanie ponownie ocenić zapisane oferty. Import PDF, DOCX i wklejenie tekstu prowadzą do edytowalnej propozycji profilu. Przed jej zatwierdzeniem automatyczny triage nie startuje; po zatwierdzeniu używa wskazanej wersji. Umiejętności i doświadczenie nie są utożsamiane z preferencjami. Na start obsługiwane są PDF-y z warstwą tekstową oraz DOCX, bez OCR skanów. Gdy tekstu nie uda się odczytać, aplikacja komunikuje problem i umożliwia jego wklejenie. Ponowny import tworzy propozycję zmian do porównania i zatwierdzenia, zachowując dotychczasowy aktywny profil i ręcznie wpisane preferencje; samo wgranie nie nadpisuje aktywnej wersji.


#### Formularz uzupełniający profil (Q5)

Niezależnie od CV właściciel przechodzi formularz sekcjami:

- Cel poszukiwań: stanowiska, kierunek rozwoju, technologie do nauki, typ firmy i projektu.
- Warunki: wynagrodzenie z walutą i podstawą, umowa, lokalizacja, tryb pracy i dni w biurze, wymiar godzin, język, strefa czasowa i dyżury.
- Znaczenie oczekiwań: konieczne, preferowane albo bez znaczenia, oraz jawne wykluczenia.
- Uzupełnienie doświadczenia: umiejętności i projekty pominięte w CV.

Pytanie można pominąć i wrócić do niego później. Pominięte pole jest niewiadomą; jawne „bez znaczenia” jest świadomym brakiem ograniczenia. System nie wyprowadza wymagań, np. oczekiwanej płacy, z dotychczasowej pracy. Wszystkie sekcje są edytowalne; przed zatwierdzeniem dostępne jest podsumowanie.

**Dodatkowe warunki AC-01:** właściciel może uzupełnić oczekiwania, których nie ma w CV, odróżnić konieczność od preferencji i zapisać wykluczenie. Pominięcie pytania nie wpisuje domyślnej odpowiedzi ani nie blokuje późniejszego uzupełnienia. Podsumowanie pokazuje świadomie wybrane oczekiwania i niewiadome osobno. Ponowny import CV nie usuwa ich ani nie aktywuje niezatwierdzonych zmian.

### R-02 — trzy rodzaje kryteriów

Wymagania podstawowe określają zakres pobierania; preferencje i wymagania konieczne służą dopasowaniu; filtry widoku dotyczą zapisanej bazy. Filtry źródłowe wolno stosować tylko przy zgodnym znaczeniu, pozostałe sprawdza się lokalnie.

**AC-02:** zmiana filtra tabeli nie zmienia zakresu importu ani profilu. Jeśli API nie wyraża danego kryterium bez utraty ofert z nieznaną wartością, lokalna kwalifikacja zachowuje takie oferty i oznacza niewiadomą. Zmiana zakresu nie stanowi dowodu niedostępności wcześniej zapisanych ogłoszeń.

## Otwarte kwestie

O-01 rozstrzygnięte produktowo (Q1–Q5). Pozostają konfiguracja wartości O-05 oraz techniczny dobór ekstrakcji/limitów w O-06. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.

## Bieżący etap: profil przed ocenami — 2026-11-01

Właściciel wybrał profil jako następny etap po importerze i liście. Powyższe potwierdzone decyzje pozostają aktualne. Dopracowanie tego wycinka nie uruchamia jeszcze triage, researchu ani zmiany zakresu PHP Senior w importerze.

Proponowany przepływ ekranu: dane zawodowe → oczekiwania → podsumowanie i zatwierdzenie. Dane można zapisać roboczo i uzupełniać etapami. Aktywna zatwierdzona wersja pozostaje odrębna od szkicu. Pierwszy profil można uzupełnić ręcznie; import CV jest sposobem przygotowania propozycji tych samych danych, a nie warunkiem posiadania CV ze wszystkimi odpowiedziami.

Podział informacji do projektu formularza:

| Część | Zawartość |
| --- | --- |
| Doświadczenie | Role, okresy, zakres odpowiedzialności, projekty i osiągnięcia; technologie w kontekście ich wykorzystania. |
| Umiejętności | Technologie z opcjonalnym poziomem znajomości, przybliżonym czasem doświadczenia, ostatnim użyciem i opisem zastosowania (potwierdzone 2026-11-01). |
| Kierunek | Poszukiwane role i seniority, technologie do rozwijania, preferowany typ pracy/projektu; nie zmieniają posiadanego doświadczenia. |
| Warunki i wykluczenia | Płaca, kontrakt, lokalizacja, tryb i wymiar pracy oraz pozostałe ustalone kryteria; każde może być konieczne, preferowane, obojętne lub nieuzupełnione. |
| Podsumowanie | Propozycje z CV, poprawki właściciela, znane oczekiwania i niewiadome, zapis szkicu oraz jawne zatwierdzenie. |

### Potwierdzone doprecyzowania — 2026-11-01

- Każda technologia ma nazwę oraz opcjonalne: poziom znajomości, przybliżony czas doświadczenia, ostatnie użycie i krótki opis zastosowania. Samej obecności technologii w CV nie interpretujemy jako poziomu biegłości. Czas doświadczenia nie jest automatycznie sumą nakładających się projektów.
- Oczekiwanie finansowe ma **jedno minimum dla wybranego kontraktu**, z jawną walutą, okresem i podstawą kwoty. Nie tworzymy osobnych równoczesnych minimów B2B/UoP. To wybór dotyczący profilu; oferta nadal może zawierać kilka wariantów wynagrodzenia i jest porównywana z właściwym wariantem.

Dodatkowe AC-01: można zapisać samą nazwę technologii bez wymuszonego poziomu/stażu. Zatwierdzona wersja zachowuje jedno wskazane minimum i kontrakt; zmiana kontraktu wymaga przeglądu powiązanych warunków kwoty, bez automatycznej konwersji netto/brutto.

Szczegóły importu, przechowywania i granic wywołania AI opisano w bieżącym solution-design; konfiguracja i kontrolna próba dostawcy pozostają warunkiem aktywacji płatnej pracy. Właściciel potwierdził 2026-11-01 zachowanie oryginalnego pliku CV lokalnie. Plik jest powiązany z importem i można do niego wrócić; ponowny import nie zastępuje poprzedniego pliku. Zatwierdzone wersje profilu zachowują wskazanie importu źródłowego, jeśli powstały z CV. Dla wklejonego tekstu zachowujemy tekst wejściowy zamiast pliku.

Dodatkowe AC-01 dotyczące CV: po imporcie można pobrać niezmieniony oryginał; odtworzenie kontenerów z zachowaniem wolumenów nie usuwa CV. Import kolejnego pliku zachowuje wcześniejszy dokument i powiązania wersji profilu. Błąd odczytu nie nadpisuje aktywnego profilu; użytkownik może wrócić do źródła i skorzystać z wklejenia tekstu.

## Zachowanie przy braku konfiguracji i błędach

Bez skonfigurowanego AI można uzupełnić i zatwierdzić profil ręcznie oraz lokalnie odczytać i pobrać CV. Przygotowanie propozycji komunikuje brak konfiguracji/środków albo błąd; nie udaje przygotowanego profilu. Błąd importu i nieukończona odpowiedź modelu nie zmieniają aktywnej wersji. Ponowny import nie usuwa danych, których model nie odnalazł; właściciel wybiera zmiany po porównaniu propozycji z istniejącymi danymi. Stary wynik nie nadpisuje późniejszych ręcznych poprawek.

Niepełny profil można zatwierdzić z jawnymi niewiadomymi. Formularz nie wymusza odpowiedzi na wszystkie pytania; sprawdza natomiast spójność wpisanych wartości (np. kwota z kontraktem/walutą/okresem/podstawą). Dwie karty nie mogą bez komunikatu nadpisać nowszego zapisu. Kolejne zatwierdzenie tej samej operacji nie tworzy podwójnej wersji.

Minimalne uruchomienie importu AI wymaga kontroli kosztów zgodnej z R-25; to zależność tego etapu, bez wdrażania teraz całego researchu i ocen. Limity pliku/czasu odczytu określa solution-design; ich przekroczenie ma czytelny komunikat i możliwość ręcznego uzupełnienia, bez cichego obcięcia wejścia.
