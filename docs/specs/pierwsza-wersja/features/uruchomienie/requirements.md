# Prywatny dostęp i lokalne uruchomienie — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-27, R-28 i odpowiadających im AC. Powiązania: brak dodatkowego modułu domenowego jako warunku projektu. Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-27 — prywatny dostęp i dane AI

Najnowsza decyzja właściciela (2026-10-31): aplikacja nie potrzebuje logowania ani kont. Lokalnie dostępna przez loopback, na przyszłym VPS przez tunel SSH. To zastępuje wcześniejszy wymóg sesji właściciela. Klucze usług i dane uwierzytelniające pozostają na serwerze poza repozytorium i logami. Wejście do AI nie obejmuje kontaktów z CV.

**AC-27:** UI/API działają bez logowania w prywatnym dostępie sieciowym. Usługi nie wystawiają publicznych portów aplikacji/bazy. Kontrolna próbka CV z numerem telefonu i e-mailem nie przenosi ich do wejścia AI ani logów. Przeglądarka nie otrzymuje klucza usług. Nie ma rejestracji kolejnych użytkowników.

### R-28 — lokalne uruchomienie i trwałość

WWW, worker i PostgreSQL działają w Docker Compose z trwałymi danymi niezależnymi od życia kontenera. Lokalny autostart po zalogowaniu wymaga uruchomionego środowiska kontenerów. Kopie zapasowe wykonuje zewnętrzna usługa.

**AC-28:** odtworzenie kontenerów z zachowaniem wolumenu zachowuje profil, oferty, historię, aplikacje, research i budżet. Aplikacja nie zawiera panelu ani harmonogramu backupów. Zamknięcie karty nie kończy workera. Dokumentacja uruchomienia jasno wskazuje zależność od runtime kontenerów; nie zakłada się, że kopiowanie aktywnego wolumenu jest spójnym backupem.

## Otwarte kwestie

Powiązane: O-06. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.
