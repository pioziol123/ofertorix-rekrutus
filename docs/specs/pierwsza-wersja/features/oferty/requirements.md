# Tożsamość ofert, rozbieżności i historia — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-08, R-09, R-10, R-11 i odpowiadających im AC. Powiązania: [pobieranie](../pobieranie/requirements.md), [dopasowanie](../dopasowanie/requirements.md), [rekrutacje](../rekrutacje/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-08 — oferta i ogłoszenia

Główna lista pokazuje ofertę pracy, do której przypisane są ogłoszenia źródłowe. Ponowny odczyt tego samego wpisu aktualizuje go, zamiast tworzyć nową ofertę. Podobne wpisy i ponowne publikacje o niepewnej tożsamości pozostają oddzielne z sugestią połączenia.

**AC-08:** wielokrotne odczytanie jednego klucza źródłowego nie zwiększa liczby ofert. Dwa podobne wpisy o innych kluczach nie zostają automatycznie połączone tylko na podstawie nazwy stanowiska/firmy. Właściciel widzi sugestię oraz źródła każdej oferty.

### R-09 — odwracalne połączenie

Właściciel zatwierdza połączenie ofert i może je cofnąć. Historia odnotowuje obie operacje. Ogłoszenia, notatki i historia pozostają zachowane; przy rozdzieleniu wskazuje przypisanie istniejących aplikacji.

**AC-09:** po połączeniu główna lista ma jedną ofertę i dostęp do wszystkich źródeł. Po rozdzieleniu źródła wracają do wskazanych ofert, wcześniejsze notatki i historia są dostępne z pochodzeniem, a każda aplikacja ma wybrane przypisanie. Operacja nie gubi żadnej aplikacji. Jeśli obie oferty mają aktywne aplikacje, przed połączeniem właściciel wskazuje, czy są to ten sam proces, czy odrębne rekrutacje. Do tej decyzji połączenie nie jest wykonywane. Żadna aplikacja, termin ani notatka nie znika automatycznie; wskazanie odrębnych procesów nie powoduje ich scalenia.

### R-10 — rozbieżności i informacje ręczne

Sprzeczne dane mają widoczne wartości i źródła. Właściciel może wskazać wartość obowiązującą, bez usuwania danych źródłowych. Ręczna informacja korzysta z jednego mechanizmu ze wskazaniem pochodzenia, również przy rozmowie z rekruterem.

**AC-10:** dla dwóch różnych widełek/trybów pracy ekran pokazuje rozbieżność, zamiast po cichu wybierać korzystniejszą wartość. Ręcznie wskazana obowiązująca informacja jest odróżnialna od odczytów i pozostaje widoczna po synchronizacji; historia odtwarza zmianę. Research nie zastępuje jej bez jawnej operacji. Dopóki rozbieżność nie została rozstrzygnięta, zachowujemy oba warianty; ich wpływ na kwalifikację określa [R-03](../dopasowanie/requirements.md#r-03--brak-informacji-i-wykluczenia). Nie sprowadzamy rozbieżności do braku danych. Właściciel może archiwizować ofertę z zachowaniem danych i historii; trwałe kasowanie nie jest częścią pierwszej wersji (Q15).

### R-11 — aktualna treść i zmiany

Szczegóły pokazują aktualną treść i historię zmian poniżej. Istotne zmiany technologii, wynagrodzenia, seniority lub trybu pracy uruchamiają ponowną ocenę w granicach budżetu. Zmiany samego formatowania nie uruchamiają AI.

**AC-11:** po zmianie wynagrodzenia treść jest aktualna, historia wskazuje zmianę, a poprzednia ocena oznaczona jako nieaktualna do ukończenia nowej. Przy braku budżetu pozostaje nieaktualna z powodem oczekiwania. Korekta białych znaków nie powoduje wywołania AI. Decyzje, notatki i wcześniejsze oceny nie znikają. Nie wymaga się przeglądarki dawnych pełnych treści.

## Otwarte kwestie

Powiązane: O-02, O-03. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.
