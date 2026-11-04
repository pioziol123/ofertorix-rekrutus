# Pobieranie i synchronizacja ofert — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **zakres zrealizowanego etapu pobierania**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Bieżący etap po setupie

Zakres do przeglądu: pobranie z SOLID.Jobs, zapis i aktualizacja ogłoszeń w PostgreSQL, historia zmian źródłowych, pełne/niepełne przebiegi, dostępność oraz codzienny i ręczny import. Uruchomienie i status przez polecenia kontenera, bez dodawania ekranów lub niezabezpieczonych endpointów danych.

Lista UI powstanie w kolejnym etapie. Profil, lokalne dopasowanie, ratingi, AI/research, profile firm i łączenie logicznych ofert nie są częścią tej implementacji. Zapisujemy pochodzenie i surowe pola potrzebne tym etapom; nie tworzymy jeszcze ich pełnego modelu.

**Potwierdzone:** bieżący zakres to wyłącznie PHP i poziom Senior według filtrów SOLID.Jobs. Staff, Vue.js i agenci AI są poza tym etapem. Zakres źródła jest wersjonowany; używamy jego podkategorii PHP i poziomu Senior, bez poszerzania importu o lokalne rozpoznawanie Staff. Brakujące dane pozostałych kryteriów w pobranych ofertach pozostają niewiadomymi.

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-04, R-05, R-06, R-07 i odpowiadających im AC. Powiązania: [profil](../profil/requirements.md), [oferty](../oferty/requirements.md), [operacje](../operacje/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-04 — pierwsze źródło

Pierwszy adapter używa oficjalnego API SOLID.Jobs. Importuje wszystkie aktualnie dostępne ogłoszenia w skonfigurowanym zakresie; kolejne przebiegi wykrywają nowe i zmienione. Historia zaczyna się od pierwszego odczytu.

**AC-04:** kontrolny zestaw źródła jest odwzorowany bez pominiętych stron i duplikatów identyfikatora źródłowego. Zapis obejmuje oryginalny identyfikator, źródło, URL, aktualną treść, dane strukturalne i daty odczytu. URL źródła jest zachowany do późniejszego widoku; w tym etapie dostępny w danych/diagnostyce CLI, bez wymogu budowania listy UI. Nie obiecuje odzyskania ogłoszeń niedostępnych przed pierwszym importem.

### R-05 — harmonogram i ręczne pobranie

Pobieranie działa raz dziennie i na żądanie. Po starcie lub wybudzeniu nadrabia jedno zaległe pobranie, bez odtwarzania wszystkich pominiętych cykli. Godzinę ustawia właściciel w konfiguracji. Proponowany startowy harmonogram: 08:00 Europe/Warsaw, z możliwością wyłączenia harmonogramu i ręcznego importu; ustawienie nie jest potwierdzoną preferencją właściciela.

**AC-05:** po kilkudniowym wyłączeniu start powoduje co najwyżej jeden zaległy przebieg dla źródła/zakresu; żądanie podczas już trwającego przebiegu nie uruchamia równoległej duplikacji. Polecenie statusu pokazuje stan bieżący, liczniki i czas ostatniej pełnej synchronizacji, bez konieczności tworzenia UI. Zamknięcie karty nie zatrzymuje pracy. Nie obiecujemy wykonania na wyłączonym/uśpionym komputerze.

### R-06 — niepełna synchronizacja

Poprawnie pobrane części zostają zapisane. Błąd nie pozwala uznać brakujących ogłoszeń za niedostępne. Właściciel odczytuje błąd w statusie przebiegu i może ponowić pobranie poleceniem CLI.

**AC-06:** przy błędzie strony 3 po udanych stronach 1–2 nowe dane z 1–2 są dostępne, przebieg oznaczony jako niepełny, data ostatniej pełnej synchronizacji nie przesuwa się. Nie zmienia się dostępność nieodczytanych ogłoszeń. Ponowienie nie tworzy kolejnych kopii tych samych wpisów.

### R-07 — dostępność a wygaśnięcie

Brak po pełnym sprawdzeniu tego samego zakresu oznacza niedostępność w źródle. Wygaśnięcie wynika z informacji źródłowej, np. daty ważności. Oba stany są odrębne od przebiegu aplikacji.

**AC-07:** nieobecność w pełnym przebiegu zmienia dostępność z zachowaniem powodu i daty; niepełny przebieg lub zmieniony zakres tego nie robi. Jawne wygaśnięcie jest oznaczone osobno. Żaden z tych stanów nie usuwa notatek ani nie zamyka aplikacji.

## Odbiór wybranego etapu

- Ręczne zlecenie i status działają z kontenera narzędziowego; pobieranie wykonuje osobny worker.
- Powtórny pełny import nie tworzy duplikatów wpisów ani rewizji o identycznej treści.
- Test zakresu potwierdza przekazanie do API podkategorii PHP i poziomu Senior, bez dodatkowego zakresu Staff i innych specjalizacji. Kontrolowane API wielostronicowe potwierdza zachowanie przy błędzie, niestabilnej paginacji i braku wpisu. Rzeczywisty import potwierdza działanie adaptera, ale nie zastępuje kontrolowanych przypadków.
- Restart workera nie pozostawia aktywnego przebiegu blokującego import bezterminowo; status przechowuje przerwanie, a ponowienie nie traci wcześniej zapisanych stron.
- Żadna operacja tego etapu nie wywołuje AI, nie uruchamia researchu ani nie wystawia ofert przez publiczny endpoint.

## Otwarte kwestie

Powiązane: O-05, O-06. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.
