# Operacje w tle i kontrola kosztów — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-24, R-25, R-26, R-29 i odpowiadających im AC. Powiązania: [uruchomienie](../uruchomienie/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-24 — podsumowanie i stany operacji

W aplikacji widoczne są nowe oferty, najlepsze dopasowania, zakończony research, nadchodzące rozmowy, błędy i stany operacji. Ukończone etapy pozostają dostępne po przerwaniu. Powiadomienia poza aplikacją są poza zakresem.

**AC-24:** błąd oceny nie ukrywa poprawnie pobranej oferty; błąd przygotowania nie usuwa wcześniejszego researchu. Dla nieudanej operacji widoczny etap, powód, historia prób i ręczne ponowienie. Informacja o zakończonym researchu prowadzi do właściwego raportu.

### R-25 — budżet

Startowy limit 100 PLN na AI i search odnawia się co miesiąc kalendarzowy w Europe/Warsaw, bez przenoszenia wolnego salda. Widoczne: wydane, zarezerwowane, dostępne. Przed każdą płatną próbą wymagana rezerwacja ograniczonego kosztu. Niepewny koszt pozostaje do ustalenia z zachowaną rezerwacją.

**AC-25:** równoczesne próby nie mogą zarezerwować łącznie więcej dostępnych środków. Brak środków zatrzymuje płatną pracę bez blokowania bezpłatnego pobierania i przeglądania. Można wznowić po zwiększeniu/odnowieniu limitu. Timeout po możliwym przyjęciu wywołania nie jest liczony jako 0 PLN. Zmiana limitu nie kupuje kredytów. Próba jest rozliczana w miesiącu rezerwacji, nawet jeśli zakończy się w kolejnym miesiącu. Niepewny koszt i rezerwacja pozostają przypisane do pierwotnego miesiąca do wyjaśnienia. Ponowienie w nowym miesiącu wymaga nowej rezerwacji z nowego limitu. Odnowienie limitu nie usuwa starych wydatków ani rezerwacji. Test granicy miesiąca potwierdza brak podwójnego odjęcia tego samego kosztu i brak skasowania nierozliczonej próby.

### R-26 — retry i priorytet

Po błędzie przejściowym jedno automatyczne ponowienie, następnie „wymaga uwagi” i ręczne ponowienie. Każda płatna próba podlega budżetowi. Ręczne zlecenia mają pierwszeństwo przed oczekującym automatycznym researchem, bez przerywania aktywnej pracy.

**AC-26:** dwa kolejne błędy przejściowe nie tworzą trzeciej automatycznej płatnej próby. Praca ukończona nie jest powtarzana tylko z powodu awarii późniejszego etapu. Ręczne zadanie czekające wraz z automatycznym researchem rozpoczyna się wcześniej po zwolnieniu wykonawcy, o ile ma środki. Nie gwarantuje się dokładnie jednokrotnego naliczenia opłaty przez dostawcę.

### R-29 — niezawodność zapisu

Trwałe wyniki, historia, budżet i postęp etapów są niezależne od technicznej historii kolejki. Ponowienie nie może duplikować skutków domenowych, a stara próba nie nadpisuje nowszych danych jako aktualnych.

**AC-29:** po restarcie workera ukończony etap jest odczytywalny, ponowne dostarczenie tego samego zadania nie tworzy drugiej oceny/raportu o tym samym kluczu wykonania. Późny wynik starego wejścia nie zastępuje aktualnej wersji. Oczyszczanie technicznej kolejki nie usuwa historii domenowej ani rozliczeń.

## Otwarte kwestie

Powiązane: O-04, O-06. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.
