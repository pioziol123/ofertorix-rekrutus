# Lokalne AI i agent researchu — wymagania przekrojowe

Status: **projekt do przeglądu**, 2026-11-04. Właściciel chce lokalnych modeli Ollamy, zaakceptował kierunek rozmowy o lokalnym agencie i zlecił plan refaktoru. Szczegóły poniżej są propozycją zachowania do uzgodnienia przed implementacją. Sam plan nie uruchamia prac wdrożeniowych.

Cel i zakres produktu: [PRD](PRD.md). Kolejność: [plan etapów](README.md). Projekt techniczny: [solution design](solution-design.md). Stan wykonania utrzymuje Beads: `bd show oferty-pracy-334`.

## Potwierdzone decyzje właściciela — aktualizacja 2026-11-04

- Model wszystkich lokalnych zastosowań: **`gpt-oss:20b` w lokalnej Ollamie**, bez wariantu `-cloud`.
- Agent researchu: **OpenCode**. Projekt integruje jego wykonanie i wynik; nie implementuje własnej pętli agenta.
- **Bez limitów korzystania z Ollamy**: brak budżetu, kwot tokenów, liczby wywołań lub rund agenta narzuconych przez aplikację. Nie kopiujemy limitów płatnego OpenAI do lokalnej ścieżki. Parametry rzeczywistego okna kontekstu są właściwością modelu i uruchomienia, nie limitem zużycia aplikacji. Zachowujemy walidację i obsługę błędów, przerwania oraz restartu.

Decyzje te zastępują wcześniejsze propozycje wyboru modelu, własnej pętli agenta oraz limitowania lokalnej pracy. Pozostałe szczegóły implementacji pozostają projektem.

## Relacja do istniejących wymagań

To rozszerzenie sposobów wykonywania AI, nie nowa definicja profilu, oceny ani researchu. Nadal obowiązują reguły [profilu](../pierwsza-wersja/features/profil/requirements.md), [dopasowania](../pierwsza-wersja/features/dopasowanie/requirements.md), [researchu](../pierwsza-wersja/features/firmy-research/requirements.md) oraz [operacji i budżetu](../pierwsza-wersja/features/operacje/requirements.md).

Dotychczasowe wymagania AC-B1 i AC-G4–G7 opisują wykonanie ocen przez Batch. Proponowane rozszerzenie zachowuje je dla OpenAI Batch; lokalne oceny mają grupę niezależnych zadań, bez obowiązku tworzenia pliku JSONL. Przed tym etapem trzeba dopisać ten zakres do kanonicznej pary dopasowania. Nie zmieniamy po cichu znaczenia dotychczasowych kryteriów.

Szczegółowy zakres każdego etapu, lokalne kryteria E01–E09 i ich weryfikację zawierają [osobne pary Requirements/SD](README.md#requirements-i-sd-każdego-etapu). LA-01–LA-10 poniżej pozostają kanonicznymi kryteriami przekrojowymi.

## Wymagania i akceptacja

| ID | Proponowane zachowanie | Kryterium akceptacji |
| --- | --- | --- |
| LA-01 | Dostawcę i model można wybrać osobno dla profilu, ocen i researchu; nieobsługiwana kombinacja jest jawnie odrzucana. | Konfiguracja mieszana działa. Brak konfiguracji lub wymaganej zdolności nie wysyła danych; nie przełącza dostawcy automatycznie. |
| LA-02 | Refaktor zachowuje istniejące wyniki, historię i aktywne operacje OpenAI. | Starsze konfiguracje i partie można odczytać, odebrać i posprzątać po wdrożeniu. Identyczne komendy nie tworzą kolejnych operacji; dotychczasowe testy przechodzą. |
| LA-03 | Wybór wykonawcy, modelu, wersji instrukcji, wejść, parametrów uruchomienia oraz cen usług płatnych jest utrwalany przy zleceniu. | Zmiana konfiguracji środowiska nie przekierowuje oczekującej operacji. Dla agenta zapisujemy runtime OpenCode i identyfikator sesji. Sekrety nie są zapisywane w migawce. Nowe zlecenie korzysta z nowych ustawień. |
| LA-04 | Lokalny import profilu nie wymaga klucza OpenAI ani cennika płatnego modelu. | Przy pustym kluczu i cenniku Ollama przygotowuje propozycję przechodzącą dotychczasową kontrolę cytatów. Profil zmienia się dopiero po zatwierdzeniu. |
| LA-05 | Lokalne oceny pojedyncze i zbiorcze zachowują zasady dopasowania. | Te same walidatory dowodów, niewiadomych, ratingu, aktualności i historii co dla OpenAI. Błąd jednej pozycji nie usuwa poprawnych wyników innych; ponowne dostarczenie nie publikuje drugi raz tej samej oceny. |
| LA-06 | Koszt i zużycie są niezależne od powodzenia zadania. | Lokalny model ma koszt API równy zero nawet przy braku telemetrii tokenów; nie udajemy zerowego zużycia. Wyczerpany budżet usług płatnych nie blokuje wyłącznie lokalnej pracy. Płatne narzędzia nadal wymagają rezerwacji. |
| LA-07 | OpenCode wykonuje research z modelem `gpt-oss:20b`, wyszukiwaniem i odczytem stron; raport sprawdza moduł researchu. | Projekt nie implementuje drugiej pętli agenta. OpenCode nie zapisuje bezpośrednio raportów ani powiązań firm. Twierdzenia odwołują się do rzeczywiście otrzymanych dowodów; brak źródeł pozostaje jawnym niepowodzeniem lub niewiadomą zgodną z istniejącym kontraktem. Stary raport pozostaje dostępny. |
| LA-08 | Lokalna praca nie ma kwot zużycia Ollamy; ma kontrolowany stan wykonania i przebieg po restarcie. | Długi przebieg nie jest przerywany z powodu kwoty tokenów, wywołań, rund ani stałego deadline lokalnej pracy. Brak modelu, zły JSON, przekroczenie fizycznego kontekstu, błąd narzędzia, przerwanie i awaria procesu mają jawny stan. Restart sprawdza konkretną sesję OpenCode, nie uruchamia drugiego agenta dla już aktywnej operacji ani ponownego płatnego wywołania o nieznanym skutku. |
| LA-09 | Narzędzia researchu czytają wyłącznie dozwolone publiczne zasoby. | Brak dostępu do plików, powłoki i zapisu danych przez agenta. Odczyt blokuje adresy prywatne i lokalne także po przekierowaniu oraz rozwiązaniu DNS; treść stron i argumenty narzędzi podlegają limitom i walidacji. Wyjątek dla skonfigurowanego lokalnego adresu Ollamy nie obejmuje narzędzi WWW. |
| LA-10 | Wdrożenie jest stopniowe, a właściciel rozpoznaje sposób wykonania. | UI i historia pokazują dostawcę/model oraz właściwy stan lokalny lub Batch. Można wrócić do OpenAI dla nowych zadań bez kasowania lokalnej historii i bez przepisywania oczekujących zadań. |

Koszt API równy zero nie oznacza zerowego kosztu energii lub sprzętu. Lokalność modelu nie oznacza pracy researchu offline: zapytania trafiają do wybranego źródła wyszukiwania, a odczyt odwiedza strony publiczne. Nie przekazujemy wyszukiwarce CV ani pełnego profilu zawodowego.

## Granice zakresu

Pierwszy agent obsługuje istniejący ręczny research podstawowy. Research pogłębiony i automatyzacja progów pozostają osobnymi pracami; nie uznajemy ich za ukończone przez ten refaktor. Nie zmieniamy zasad ratingu, decyzji właściciela, importu ogłoszeń, kopii zapasowych ani stosu aplikacji.

Pierwsze wydanie nie obejmuje automatycznego wyboru modelu, pobierania modeli, fallbacku do chmury, dowolnych narzędzi agenta ani budowy ogólnej platformy agentowej. Nowy ekran ustawień nie jest warunkiem pierwszego wydania — proponowana konfiguracja jest serwerowa.

## Decyzje otwarte

| ID | Co ustalić | Co blokuje |
| --- | --- | --- |
| O-L1 | Wybór modelu zamknięty: `gpt-oss:20b`; runtime agenta zamknięty: OpenCode. Zweryfikować wersje, pamięć, JSON, narzędzia i osiągane czasy na tym zestawie. | Pilot integracji wybranego zestawu; nie otwiera ponownie wyboru modelu ani runtime. |
| O-L2 | Źródło wyszukiwania: dostęp, warunki, konfiguracja, koszty i jakość wyników. | Włączenie narzędzia wyszukiwania i pełnego lokalnego researchu; nie blokuje profilu ani ocen. |
| O-L3 | Kontrakt sesji OpenCode: utrwalenie ID, obserwacja, anulowanie, restart, końcowy wynik i retencja. Brak kwot Ollamy jest ustalony. | Integrację agenta poprzedza sprawdzenie obsługi sesji i parametrów rzeczywistego kontekstu. Techniczne ograniczenia odczytu niezaufanych stron nie są kwotą korzystania z modelu. |
| O-L4 | Akceptacja pary requirements/SD pierwszego etapu i późniejszych istotnych zmian. | Gotowość odpowiednich zadań implementacyjnych; prośba o plan nie jest ich akceptacją. |

OpenCode jest wybranym runtime agenta. Projekt potrzebuje adaptera uruchomienia/sesji, konfiguracji dedykowanego agenta researchu i integracji dowodów; nie potrzebuje własnego frameworka agentowego.
