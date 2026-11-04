# Zarządzanie rekrutacjami — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-22, R-23 i odpowiadających im AC. Powiązania: [oferty](../oferty/requirements.md), [firmy-research](../firmy-research/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-22 — aplikacje i etapy

Jednej rekrutacji odpowiada jeden bieżący proces aplikacji niezależnie od portalu, z zapisanym kanałem wysłania. Przy łączeniu ofert z istniejącymi aktywnymi aplikacjami właściciel wskazuje, czy to ten sam proces, czy odrębne rekrutacje; odrębne procesy pozostają zachowane i nie są automatycznie scalane. Kolejne podejście po zamknięciu może być osobną aplikacją. Etapy: do rozważenia → planuję aplikować → aplikacja wysłana → rozmowy → decyzja. Właściciel może ręcznie zmienić etap, a na każdym etapie zakończyć proces jako: zatrudnienie, odmowa firmy, rezygnacja albo odrzucenie oferty przez właściciela. Poszczególne rozmowy i zadania zapisuje się oddzielnie.

**AC-22:** dodanie kolejnego ogłoszenia tej samej oferty nie tworzy nowej aplikacji. Ponowne podejście zachowuje poprzednią aplikację i jej wynik. Zmiana oceny lub niedostępność ogłoszenia nie zmienia etapu. Historia pokazuje ręczne zmiany z datą. Każdy uzgodniony etap i wynik zakończenia można zapisać; ręczna zmiana etapu nie wymaga odbycia fikcyjnych rozmów pośrednich. Zakończenie zachowuje rozmowy, terminy, zadania i notatki.

### R-23 — informacje rekrutacyjne

Właściciel zapisuje notatki, tagi, kontakty rekruterów, wiele rozmów, terminy i zadania rekrutacyjne. Zmiany są zachowywane w historii.

**AC-23:** dla jednej aplikacji można zapisać dwie rozmowy z różnymi terminami, kontakt, zadanie i notatkę, następnie je poprawić bez utraty wcześniejszej historii. Zmiany są dostępne po ponownym uruchomieniu. Pierwsza wersja pozwala archiwizować oferty i procesy oraz poprawiać dane z historią, bez funkcji trwałego kasowania. Archiwalne dane można nadal przeglądać. Archiwizacja nie usuwa powiązanych rozmów, zadań, kontaktów, notatek ani historii.

## Otwarte kwestie

Powiązane: O-03, O-07. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.
