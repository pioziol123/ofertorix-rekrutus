# Etap 6: Lokalne oceny pojedyncze i zbiorcze — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 6 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.7`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E06-R01–E06-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Nowy lokalny wykonawca korzysta z MatchingTask/publikacji etapu 3 i adaptera etapu 5. store.ts/groups.ts wybierają trasę z migawki. Worker dostarcza krótkie jednostki obserwacji/claim; trwały postęp jest w PostgreSQL. Rozszerzyć readMatching i komponenty ocen o lokalne stany, bez pól Batch dla lokalnego wykonania.

## Decyzja E06-D01 — Trwały stan każdej lokalnej oceny

**Propozycja:** Jedno długie wywołanie dla całej grupy utrudnia częściowy sukces i restart. Publikacja pozostaje wspólna z Batch, a wykonanie jest odrębne.

Punkty integracji w obecnym katalogu: [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/matching/groups.ts](../../../../../lib/matching/groups.ts), [lib/matching/model.ts](../../../../../lib/matching/model.ts), [app/components/OfferMatching.vue](../../../../../app/components/OfferMatching.vue). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

matching_requests zachowuje ad_revision_id/profile_version_id/input i operation ID. Dla lokalnego wykonania request_payload jest null (brak payloadu OpenAI) i nie powstaje matching_batches. Migracja musi zmienić NOT NULL, jeśli bieżący schemat go wymaga. Do aktywnych stanów dodać running i cancelling, do końcowych cancelled; istniejący unknown obejmuje niepewny skutek wykonania. Każdy nowy stan ma wejść do właściwych częściowych indeksów pending i zapytań recovery.

Przejścia lokalne: queued→running→completed|failed|unknown; queued→cancelled; running→cancelling→cancelled, jeżeli zatrzymanie potwierdzono, w przeciwnym razie unknown. Koszt lokalnej inferencji jest zawsze znany zero, niezależnie od stanu. Lokalne unknown o nierozstrzygniętej aktywności blokuje nową ocenę dla tego samego ogłoszenia do wyjaśnienia, także gdy dotychczasowy indeks pending nie obejmował unknown. Zabezpieczenie musi działać atomowo w komendzie oraz po utracie lease. claim/lease używa warunkowej aktualizacji i tokenu właściciela; publikacja odrzuca stary token i wynik anulowanej operacji. Nie utrzymywać transakcji podczas HTTP.

Grupa przechowuje command_id i członków z jednoznacznym request ID; lokalne wykonanie nie wymaga identyfikatora partii. Stan agregowany: queued przed startem, running dopóki istnieją aktywne pozycje, completed gdy wszystkie rozstrzygnięte; oddzielne liczniki completed/failed/cancelled/unknown/excluded nie pozwalają mylić zakończenia z pełnym sukcesem. Przy anulowaniu grupa nie przyjmuje nowych claimów, zachowuje wyniki już opublikowane. unknown wymaga wyjaśnienia przed ponowieniem danej pozycji.

Brak kwoty tokenów/wywołań i narzuconej współbieżności 1. Pobieranie członków grupy stronicować; ograniczenie porcji w pamięci nie odrzuca reszty komendy. Jeśli obecny interfejs komendy ma limit 100 związany z Batch, lokalna trasa nie dziedziczy go jako limitu inferencji; sposób przesyłania większej komendy wymaga doprecyzowania API przed kodem. Bez zmian limitów płatnego Batch.

## Migracja i uruchomienie

Nowe migracje stanów, nullable pól Batch, indeksów aktywności i ewentualnego lease; test na starych aktywnych rekordach. Do kanonicznych requirements/SD dopasowania dopisać lokalny wariant AC-B1/AC-G4–G7, nie zmieniając znaczenia dla Batch. Włączyć po lokalnym profilu, najpierw ręcznie kilka ocen i grupę.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Porównać walidację tego samego assessment po normalizacji Batch/Ollama.
2. Integracja grupy: sukces+błąd+excluded, out-of-order, duplikat komendy i wyniku.
3. Restart, utrata lease i race anulowanie/publikacja; stare wyniki nie wypierają aktualnych.
4. Migracja z aktywną partią, read API/UI obu wykonawców, zero budżetu lokalnie, większa grupa bez limitu Batch.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E06-AC01 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC02 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC03 | Próby 2–3 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC04 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC05 | Próby 3–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E06-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

Przed implementacją domknąć API dużych lokalnych komend i ostateczny stan grupy przy unknown. To propozycja rozszerzenia istniejącego API; nie zmieniać kontraktu Batch bez przeglądu. Strategia przerwania lokalnego HTTP pochodzi z etapu 5.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.
