# Prywatny dostęp i lokalne uruchomienie — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-27/AC-27, R-28/AC-28.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Dostęp bez logowania

Decyzja właściciela 2026-10-31 zastępuje wcześniejszą propozycję konta/sesji: brak logowania i rejestracji. UI/API dostępne przez loopback lokalnie, na VPS przez tunel SSH. Klucze usług pozostają po stronie serwera. Reguły ograniczania danych CV do wejścia AI pozostają dla przyszłego modułu.

## Usługi i trwałość

Compose udostępnia tylko port WWW na `127.0.0.1`. PostgreSQL wyłącznie w sieci wewnętrznej, worker bez portów hosta. Sekrety w niewersjonowanej konfiguracji hosta lub plikach sekretów, nigdy w publicznym runtime config Nuxt. Kontenery mają politykę restartu i kontrole gotowości; na Macu runtime uruchamia się po zalogowaniu. Przy starcie/okresowym sprawdzeniu worker porównuje ostatnie wykonanie z planem i atomowo zleca jeden zaległy przebieg.

Migracje aplikacji i schematu pg-boss mają określoną kolejność przed uruchomieniem konsumentów. Nie uruchamiać konkurencyjnych migratorów z WWW i workera. Usunięcie/odtworzenie kontenerów zachowuje nazwany wolumen; procedura startu nie używa kasowania wolumenów. Odtworzenie kontenera nie jest testem odtworzenia backupu.

Proponowane wartości do prób integracyjnych, **nie potwierdzone parametry produkcyjne**:

| Parametr | Punkt startowy / warunek |
| --- | --- |
| Równoległość | 1 import danego źródła, 1 płatny etap globalnie |
| Timeout HTTP źródła | 30 s na żądanie |
| Timeout AI | dobrać po pomiarze i granicach API; mniejszy niż expiry zadania |
| Heartbeat | 30 s, aktywny mechanizm workera |
| Expiry etapu | dobrać osobno dla importu/AI, powyżej ograniczonego czasu pracy |
| Retry | licznik aplikacji: maks. 1 dodatkowa automatyczna próba, budżet przed każdą |
| Retencja kolejki | jawna konfiguracja po wyborze wersji; nigdy źródło historii lub jedyna kopia oczekującej operacji |
| Przegląd zaległości | na starcie i okresowo; unikalność operacji zapobiega powielaniu |

Nie wybrano exact wersji Node/Nuxt/Nuxt UI/PostgreSQL/SDK ani narzędzia migracji. Przed pierwszą implementacją infrastruktury dobrać kompatybilne wersje, przypiąć je w obrazach i lockfile, sprawdzić build i współpracę pg-boss ze wspólną transakcją. To warunek techniczny, nie potrzeba nowej decyzji produktowej.

## Integracja z pozostałymi funkcjonalnościami

brak dodatkowego modułu domenowego jako warunku projektu. Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); ten moduł zapewnia prywatny dostęp i trwałe uruchomienie. Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Dostęp lokalny bez logowania, sieć hosta/Compose, brak sekretów w bundle/logach, odtworzenie kontenerów bez skasowania wolumenu, autostart runtime i praca po zamknięciu karty. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-06 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.

