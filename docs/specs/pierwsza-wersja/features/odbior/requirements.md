# Odbiór całego przepływu — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-30 i odpowiadających im AC. Powiązania: [profil](../profil/requirements.md), [pobieranie](../pobieranie/requirements.md), [oferty](../oferty/requirements.md), [dopasowanie](../dopasowanie/requirements.md), [firmy-research](../firmy-research/requirements.md), [przeglad](../przeglad/requirements.md), [rekrutacje](../rekrutacje/requirements.md), [operacje](../operacje/requirements.md), [uruchomienie](../uruchomienie/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-30 — odbiór

Odbiór obejmuje rzeczywisty przepływ SOLID.Jobs, wspólny przegląd 20 ocen, śledzenie istotnych ustaleń researchu do źródeł, próby błędów/restartu/budżetu oraz działanie lokalne w Docker Compose.

**AC-30:** raport odbioru zawiera identyfikatory ofert i wersji, opinie właściciela o 20 zróżnicowanych ocenach, wyniki scenariuszy AC-01–AC-29, znane odchylenia i wynik decyzji o odbiorze. Przegląd obejmuje dobre, słabe i niepewne dopasowania; brak kompetencji dopisanych przez AI i brak utożsamiania niewiadomych z potwierdzonym brakiem. Rozbieżność z opinią właściciela jest wyjaśnialna i nie stanowi automatycznie błędu. Nie narzucamy nieuzgodnionego procentowego progu zgodności. VPS oraz konfiguracja/testy odtworzenia z zewnętrznej usługi backupów są poza tym odbiorem.

## Otwarte kwestie

Powiązane: O-01, O-02, O-03, O-04, O-05, O-06, O-07. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.
