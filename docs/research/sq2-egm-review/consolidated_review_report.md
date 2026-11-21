# Przegląd EGM epiku sq2 (zlecenia AI) — raport zbiorczy

Data: 2026-11-21. Metoda: Elephant-Goldfish Model, tryb „raport zbiorczy”. Dziesięciu recenzentów bez znajomości wcześniejszych rozmów przeczytało PRD, wymagania, projekt rozwiązania i 14 ticketów epiku (eksport: `tickets-export.md`). Raporty cząstkowe leżą w `raw/`.

Czytano kopię roboczą z niezatwierdzonymi zmianami w PRD i wymaganiach. Lokalna gałąź `main` była 11 commitów za `origin/main`: gotowa biblioteka kolejek i workera z epiku pracy w tle (2ba) jest tylko na zdalnej.

Ocena ogólna: cel i zakres są zrozumiałe, ale ticketów nie należy jeszcze przekazywać do wdrożenia. Dwie decyzje projektu wywołują większość problemów: równoległe działanie starej i nowej drogi zlecania (A) oraz dostarczanie wyniku do modułu zlecającego osobną kolejką (B).

## 🔴 Blokery

### A. Stara i nowa droga zlecania działają obok siebie od T1 do T10
Co psuje się właścicielowi i agentowi wdrażającemu:
- Kolejka wykonawcy nie może obsługiwać zleceń z obu dróg tak, jak zakłada projekt. Biblioteka kolejek dopuszcza jedną obsługę na kolejkę, więc agent zadania T3 (sq2.4) musiałby sam wymyślić rozwiązanie.
- Budżet może zostać przekroczony. Nowa droga odlicza wydatki starej, ale stara nie odlicza wydatków nowej.
- Między T10 a T13 przestaje działać karta budżetu na stronie profilu: stare dane trafiają do archiwum, a nowy odczyt budżetu powstaje dopiero w panelu.
- PRD mówi, że obie drogi nigdy nie działają naraz, a wymagania i projekt mówią, że działają.

Propozycja recenzentów: system nie działa jeszcze produkcyjnie, więc nowa droga może dostać własne kolejki i własne liczenie budżetu. Zdanie z PRD dotyczyłoby wtedy tylko wydania. Nowy odczyt budżetu powstałby w T3, a T7–T10 dałoby się może połączyć w mniej zadań. **Decyzja należy do Ciebie**: przyjmujesz ryzyko, że w czasie budowy obie drogi mogą razem wydać więcej, niż pozwala budżet.

### B. Sprawa w module zlecającym może utknąć, a opłacony wynik przepaść
- Jeśli profil albo firmy nie odbiorą wyniku lub wiadomości o porażce, ich sprawa zostaje na zawsze „w toku”. Nowego zlecenia nie da się złożyć, a pomaga tylko poprawka w bazie. To łamie obietnicę PRD, że wszystko da się naprawić z aplikacji.
- Kolejka dostarczania nie wie, co zrobić, gdy wszystkie próby zawiodą. Zlecenie wisi wtedy, aż po 7 dniach skończy się z powodem „przekroczony limit czasu”, a opłacony wynik przepada (sprzeczność T6-R07 z T6-R08).
- Komunikat w profilu odsyła do panelu, a panel pokazuje wynik odrzucony przez moduł jako udany: bez powodu, bez surowej odpowiedzi i bez przycisku Ponów.

Propozycja recenzentów:
1. Limit czasu pomija zlecenie, którego wynik czeka na dostarczenie.
2. Gdy dostarczenie zawiedzie ostatecznie, zlecenie dostaje jasny stan z widocznym powodem i można je ponowić z panelu.
3. O porażkach moduły dowiadują się z odczytu statusu, który już mają, zamiast z osobnego powiadomienia. Wariant najprostszy: wynik dostarczany od razu po zakończeniu operacji, bez osobnej kolejki dostarczania i bez powiększania puli workera do 3.

**Decyzja należy do Ciebie.**

## 🟡 Istotne

1. **Brak najdłuższego czasu pracy płatnego wykonawcy.** Wiadomo tylko, że lokalny ma 30 minut. Badanie firmy przez agenta nie ma limitu całej sesji, więc kolejka może je przerwać po 60 minutach i skończy się jako niepewne. Jedno badanie wstrzymuje też wszystkie oceny ofert, bo płatny wykonawca robi jedną operację naraz. Nie da się sprawdzić kryterium T2-AC03.
2. **Obietnica szybkości i kosztu bez liczb.** Wyniki „w ciągu minut” dla paczek do 100 ofert przy jednej operacji naraz, a do tego praca AI konkuruje o procesy workera z synchronizacją ogłoszeń i czytaniem CV. Brakuje szacunku, ile ocen zmieści się w 100 zł miesięcznie.
3. **Przerwana operacja zawsze trafia do właściciela jako niepewna**, nawet gdy do dostawcy nic nie poszło. Zapis wymiany powstaje przed wysłaniem, więc taki przypadek mógłby być zwykłą porażką bez kosztu, z automatycznym ponowieniem. Każde wdrożenie dodaje inaczej pozycję „wymaga uwagi”.
4. **Sekrety i dane osobowe w zapisanych wymianach.** „Dokładne żądanie” może zawierać klucz API i treść CV, a nie ma okresu przechowywania. To sprzeczne z regułą architektury o sekretach.
5. **Miernik sukcesu z PRD nie działa w miesiącu wdrożenia.** Suma w panelu nie uwzględnia kwoty przeniesionej sprzed wdrożenia (T10-R01).
6. **Przenoszenie budżetu nie mówi, jak liczyć dzisiejsze stany prób**, na przykład próbę czekającą w kolejce, która już trzyma rezerwację. Nie mówi też, skąd nowy limit domyślny przejmuje dzisiejsze 100 zł z kodu.
7. **Nie wiadomo, które zadanie tworzy które tabele i kolumny w bazie.** Zmiana schematu bez przypisania zatrzymuje agenta albo kończy się podwójnymi migracjami. Nie wymieniono też kolumn profilu, dopasowania i firm do zastąpienia.
8. **Interfejs wykonawcy nie jest zapisany jako kontrakt**: brakuje wyniku, zapisów i materiałów agenta. Opiera się na nim T3–T6, a tabela „co dzieje się po zakończeniu operacji” jest rozdzielona między T3, T4 i T6 bez opisu, co obowiązuje po każdym z nich.
9. **Sprawdzenie przed złożeniem zlecenia (T1-R09) jest nieopisane.** Nie wiadomo, kto je liczy, gdzie się przechowuje i jaki błąd zwraca, a dziś istnieje tylko w pamięci procesu.
10. **Rozważony był tylko nowy model danych.** Projekt nie porównuje go z rozbudową istniejącego modelu wykonań i prób ani z ponownym użyciem istniejącego archiwum wymian (`batch-archive`), które widok dopasowania już czyta. Limit 3 zapisany przy każdym zleceniu i kopia cennika przy każdej operacji to dodatkowe dane bez potrzeby w MVP.
11. **Te same słowa znaczą różne rzeczy.**
    - „Operacja” to operacja AI, transakcja i funkcja.
    - „Próba” to próba w kolejce, rekord starej drogi i powtórzone wywołanie.
    - „Zadanie AI” myli się ze zleceniem AI, z ticketem bd i z zadaniem w kolejce.
    - „Rezerwacja” należy do starego modelu budżetu.
    - Powody porażek mają po dwie nazwy, na przykład `delivery_failed` i „wynik nie odebrany”.
    - Glosariusz przeczy projektowi aż do T10, więc agenci T1–T9 przeczytają w nim nieaktualne definicje.
12. **Projekt opiera się na zasadach epiku pracy w tle cytowanych tylko numerami** (B1-R10 i inne). Nie podaje limitu czasu kolejki lokalnej i nie przyznaje, że biblioteka kolejek już istnieje w kodzie.
13. **Brakuje struktury, której wymaga standard:**
    - Sekcja ryzyk w PRD. Powinna wymienić ryzyka przyjęte w A, B i w punktach 1–2.
    - Zakres („Scope”) w T4–T13.
    - Zależności („Depends on”) w T2–T6.
    - Kryterium akceptacji dla T5-R05. T5-AC02 nie sprawdza też pięciominutowej granicy.
14. **Opis epiku i ticket sq2.1 są nieaktualne.** Epik wciąż mówi o projektowaniu od zera, pracy wsadowej i etykiecie `needs-info`. sq2.1 cytuje złe pytania z wywiadu (Q73, Q75), pyta o tryb wsadowy, który odłożono, i blokuje przekazanie epiku do wdrożenia, bo ma etykietę `needs-triage`.

## 🟢 Drobne (do jednego sprzątania przed przekazaniem)
- Zła ścieżka do reguł architektury w kryterium ZA-AC02 wszystkich ticketów (brakuje `docs/`).
- Brak etykiet przekazania na ticketach.
- Kryteria w T8 i T9 nie są po kolei, a cztery kryteria nie wskazują wymagania.
- Projekt mówi, że T11 może ruszyć wcześniej, a tickety tworzą ścisły łańcuch.
- Powiększenie puli workera do 3 nie należy do żadnego zadania.
- Przesunięcie numeracji: T&lt;n&gt; odpowiada sq2.&lt;n+1&gt;.
- Etykiety z wcześniejszych dokumentów (R-25, PZ-01–PZ-08, numery Q) są nie do odnalezienia.
- Sekcja „Towards more traffic” jest spekulacją. Nie szkodzi, jeśli nic się pod nią nie buduje.
- Operacja, na którą nie starcza budżetu, może czekać do limitu 7 dni bez żadnego sygnału.

## Mapa pochodzenia
| Punkt | Raporty |
| --- | --- |
| A | stage9-implementation-readiness B1, stage9-codebase-details M4, stage5-zoom-out M1–M2, stage6 M2, stage7-structural M4, stage5-inventive-catalyst M-3, stage8 B1 |
| B | stage5-inventive-catalyst B-1/M-1, stage7-design M4/M5/M8, stage9-codebase-details M3, stage9-implementation-readiness M2, stage8 M1 |
| 1–2 | stage5-zoom-out M3, stage7-design M2/M3/M7, stage9-implementation-readiness M3, stage8 M4 |
| 3 | stage5-inventive-catalyst M-2, stage8 M2 |
| 4 | stage7-design M6 |
| 5 | stage6 M6, stage7-design M9 |
| 6–7 | stage9-codebase-details M2/M5/M6, stage9-implementation-readiness M1 |
| 8–9 | stage9-implementation-readiness M4/M6/M7, stage6 M5 |
| 10 | stage5-zoom-out M4, stage5-inventive-catalyst N-1/N-3, stage8 M3 |
| 11 | stage6 M4, stage9-style M1–M7, stage7-style |
| 12 | stage6 M1, stage9-codebase-details M1 |
| 13 | stage7-structural M1–M3/M5, stage7-design M1 |
| 14 | stage6 M7, stage9-style M8, stage9-implementation-readiness N1 |
