# Etap 5: Ollama gpt-oss:20b i lokalny profil — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 5 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.6`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E05-R01–E05-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Dodać lib/ai/models/ollama.ts implementujący strukturalny model etapu 2. Wprowadzić wersjonowaną konfigurację w lib/ai/configuration.ts; przełączanie wykonania należy do koordynatora, nie walidatora profilu. Zaktualizować .env.example, Compose, README, gotowość API/UI i recovery profilu. Ollama na hoście jest propozycją pilota; połączenie sprawdzić z kontenera.

## Decyzja E05-D01 — Natywny adapter Ollamy i konfiguracja wersjonowana

**Propozycja:** Protokół OpenAI-compatible jest alternatywą, lecz natywne API pozwala jawnie obsłużyć zakończenie i telemetrię Ollamy. OpenCode nie jest potrzebny do pojedynczej propozycji profilu.

Punkty integracji w obecnym katalogu: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [worker/index.ts](../../../../../worker/index.ts), [.env.example](../../../../../.env.example). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

Propozycja nowych env: AI_PROFILE_EXECUTION_JSON, AI_MATCHING_EXECUTION_JSON, AI_RESEARCH_EXECUTION_JSON. Brak zmiennej oznacza odczyt dotychczasowego *_PRICING_JSON jako OpenAI. Obecność pustej/błędnej nowej zmiennej oznacza błąd konfiguracji, bez cofnięcia do legacy. Nowy wybór ma version:1, provider:'openai'|'ollama', execution:'direct'|'batch'|'agent', model:string, endpointRef:string. Dozwolone: profil openai/direct i ollama/direct; oceny openai/batch (ollama/direct dopiero etap 6); research openai/direct (ollama/agent dopiero etap 8). Ollama model musi być dokładnie gpt-oss:20b. Nieobsługiwaną jeszcze kombinację odrzucamy przed wysłaniem danych.

Migawka zapisana w configuration zawiera dodatkowo promptVersion, schemaVersion, runtimeParameters, endpointRef i identyfikator/digest modelu, gdy dostępny. Jeśli zlecenie ma zapisany digest modelu, worker sprawdza go przed wykonaniem; zmiana modelu pod tym samym tagiem daje jawny błąd zamiast cichego wykonania inną wersją. Gdy digest nie jest dostępny, zapisujemy null i jawny brak takiej gwarancji w pilocie. Endpoint i sekret są rozwiązywane przez serwerowy rejestr; zmiana adresu pod danym endpointRef wymaga nowej wersji tego wpisu. Brak starego wpisu blokuje wykonanie zamiast przekierować zadanie. Stary JSON bez version jest dekodowany jako legacy, bez nadpisywania w bazie. Wariant OpenAI przechowuje dotychczasowe ceny i limity; Ollama nie ma cennika ani pól kwot użycia.

POST /api/chat: messages i format z JSON Schema; stream:false na początek. Adapter normalizuje wynik do ModelResult etapu 2; treść myślenia nie jest raportem. completed wymaga zakończenia i akceptowalnego done_reason; brak pełnego wyniku nie publikuje propozycji. Nie kopiować maxOutputTokens z płatnej konfiguracji do num_predict. Okno fizyczne jest zapisanym parametrem runtime. Preflight z metadanymi modelu nie dowodzi zmieszczenia wejścia: pilot musi potwierdzić wykrywanie przepełnienia; jeśli nie można go wiarygodnie wykryć, LA-08 pozostaje niespełnione.

Ograniczenie SQL attempt BETWEEN 1 AND 2 dotyczy obecnej polityki płatnego profilu; nie może stać się kwotą lokalnych inferencji. Dla lokalnej ścieżki przewidzieć addytywną zmianę tego ograniczenia lub oddzielne identyfikatory generacji dla jawnych ponowień. Błędny format kończy próbę; brak kwot nie oznacza automatycznego zapętlenia identycznego błędu.

Lokalna próba korzysta z ai_attempts, ale rezerwacja wynosi 0 i nie sprawdza dostępnego płatnego salda. actual_pln=0 po zakończeniu również przy nieznanym usage; usage=null oznacza brak pomiaru. Dodanie cancelled i ewentualnych metadanych lease wymaga nowej migracji i sprawdzenia indeksu profile_one_pending_ai. Przerwanie oznacza brak publikacji; utrata łączności nie dowodzi zatrzymania inferencji na serwerze. Recovery nie uruchamia drugiego HTTP, gdy pierwsze może nadal działać: oznacza wykonanie niepewne, koszt lokalny pozostaje znany zero. Jawne ponowienie tworzy nową próbę po wyjaśnieniu poprzedniej.

## Migracja i uruchomienie

Addytywna migracja metadanych wykonania/stanów tylko jeśli wymagana, bez zmiany starych konfiguracji. WWW i worker dostają spójną konfigurację. Kolejka nie może automatycznie przerwać lokalnego modelu po obecnych 300 s: lease jest odnawiany, a jego utrata nie uprawnia do nowej inferencji. Włączenie tylko nowych profili po pilocie; stary OpenAI pozostaje obsługiwany. Uzupełnić D-05 architektury jako rozszerzenie.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Test konfiguracji legacy/v1, pustych env, kombinacji niedozwolonych i braku sekretów w migawce.
2. Testy atrapy Ollamy: normalizacja, done_reason, brak usage, błędny JSON, odmowa/przerwanie i awarie.
3. Integracja PG: lokalny koszt zero przy przekroczonym budżecie, zmiana konfiguracji, równoległy claim, duplikat wyniku i anulowanie.
4. Pilot syntetyczny: worker→host, gpt-oss:20b, cytaty, kontekst, długi przebieg bez deadline i przerwanie; zapisać dowody.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E05-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC02 | Próby 2, 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC03 | Próby 1, 3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC04 | Próby 3–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC05 | Próby 2–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E05-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

O-L1: nie potwierdzono wersji/pamięci/kontekstu wybranego zestawu. Przed implementacją zamknąć dokładne mapowanie done_reason, sposób kontroli przepełnienia i odzyskiwania bez podwójnej inferencji. Env oraz pola konfiguracji są propozycją, nie już istniejącym kontraktem.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.

## Źródła integracji

Zweryfikowano 2026-11-04: [chat API Ollamy](https://docs.ollama.com/api/chat) opisuje format żądania i wynik; [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) opisuje przekazanie JSON Schema. Obsługę na wybranej wersji i modelu potwierdza dopiero pilot.
