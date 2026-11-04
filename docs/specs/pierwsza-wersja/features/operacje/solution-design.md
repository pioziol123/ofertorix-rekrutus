# Operacje w tle i kontrola kosztów — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-24/AC-24, R-25/AC-25, R-26/AC-26, R-29/AC-29.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Własność danych i kontrakty

| Encja / grupa | Istotne pola i niezmienniki |
| --- | --- |
| Operation / Attempt | Typ, cel, wejściowe wersje, trigger `manual/automatic`, stan, checkpoint, dedup key, generation, próby i błąd. To trwałe źródło statusu, nie rekord zadania pg-boss. |
| BudgetMonth / Reservation / Usage | Miesiąc, limit, rezerwacje i wydatki; każda płatna próba powiązana z modelem, wersją cennika, limitem, użyciem, walutą/przelicznikiem i identyfikatorem dostawcy. |

## Wykonanie i transakcje

Proponowane stany trwałej operacji: `queued`, `running`, `waiting_budget`, `needs_attention`, `succeeded`, `superseded`. Próba ma osobno stan wykonania i rozliczenia `reserved/settled/unknown/released`. Sukces merytoryczny może współistnieć z kosztem do wyjaśnienia; nie udajemy, że wszystko jest jednym statusem.

Dedup key zawiera typ pracy, cel oraz wersje wejścia. Dla odświeżenia na żądanie zawiera dodatkową generację, aby jawne nowe wykonanie nie zostało zablokowane jako dawny duplikat. Przycisk ponowienia istniejącej operacji kontynuuje jej checkpoint, nie udaje nowego niezależnego procesu.

1. W transakcji zapisać mutację, zdarzenie historii, operację i zlecenie pg-boss z identyfikatorem operacji. Integracja SQL kolejki musi użyć tego samego połączenia i transakcji; jeśli to nie jest zapewnione, nie wolno opisać wysłania jako atomowego. Alternatywa do osobnego przeglądu: transactional outbox.
2. Worker blokuje/claimuje operację i generację. Jeśli już ukończona albo nieaktualna, kończy techniczne zadanie bez ponownego efektu.
3. Przed płatnym etapem krótka transakcja blokuje rekord budżetu, sprawdza limit i zakłada rezerwację dla próby. Następnie commit.
4. Wywołanie sieciowe poza transakcją. Zapisać request/response id, limity i użycie bez sekretów; nie zakładać, że request id dowodzi braku drugiego obciążenia.
5. Wynik i rozliczenie zapisać atomowo z checkpointem. Warunkowo aktualizować wskaźnik bieżącego wyniku tylko, jeśli generacja i wersje wejścia są nadal właściwe. Stary wynik może pozostać historyczny, ale nie zastępuje nowego.
6. Przy utracie workera sprawdzić checkpoint i stan próby. Po niepewnym wywołaniu nie zwalniać rezerwacji; retry wymaga osobnych środków. Awaria po odebraniu odpowiedzi, a przed trwałym zapisem może wymagać ponowienia i ponownej opłaty — nie ma gwarancji exactly-once AI.

Aktualnie sprawdzona [dokumentacja pg-boss](https://pgboss.io/introduction) opisuje długowieczną instancję na proces i własny schemat. [Opcje jobs](https://pgboss.io/api/jobs), odczyt 2026-10-31, mają domyślnie dwa retry i wyłączony heartbeat; nie odpowiada to automatycznie kontraktowi aplikacji. Nie polegamy na domyślnych ustawieniach.

Propozycja SD: retry płatnych etapów kontroluje trwała operacja (maksymalnie jedna dodatkowa automatyczna próba po błędzie przejściowym); techniczne ponowne dostarczenie nie resetuje licznika. Aktywny heartbeat i expiry są jawne. Oczekujące operacje aplikacji odtwarzają brakujące zadania kolejki, więc retencja pg-boss nie może po cichu zgubić pracy czekającej na budżet. Retry po 429/5xx/timeout stosuje opóźnienie i informację dostawcy; błędy autoryzacji/konfiguracji wymagają uwagi. Nie ma nieskończonej naprawy JSON.

**Priorytet:** wspólna kolejka płatnych etapów z priorytetem ręcznym wyższym od automatycznego researchu. Prace bez środków nie zajmują wykonawcy; wznawiane po zdarzeniu zmiany miesiąca/limitu. Długiej aktywnej operacji nie przerywa nowa ręczna. Reguła priorytetu jest sprawdzana przy pobieraniu kolejnego zadania, nie tylko w kolejności utworzenia.

## Budżet i ograniczenia

Dziennik kosztów przechowuje cennik obowiązujący przy próbie i przyjęty przelicznik PLN. To rachunek aplikacji, nie gwarancja identyczności z fakturą, podatkami lub innym użyciem konta.

Rezerwacja musi pokrywać wyznaczoną górną granicę danej próby: wejście, wyjście, narzędzia i ewentualne osobne formatowanie. Prompt „nie przekrocz” nie jest kontrolą. Jeśli API nie daje technicznego ograniczenia danego kosztu, dany wariant płatnego etapu nie jest gotowy do włączenia. Przed startem ustalić limity tokenów, źródeł, search i rund oraz sposób ich egzekwowania, a nie wyłącznie estymację średniej.

`dostępne = limit - rozliczone wydatki - aktywne rezerwacje` dla uzgodnionego miesiąca, z kontrolą współbieżności. Nadwyżkę rezerwy zwalnia się po wiarygodnym rozliczeniu. Nieznany koszt pozostaje aktywny; panel musi umożliwić wyjaśnienie na podstawie danych dostawcy. Zmiana limitu ma historię. **Potwierdzone Q13:** próba ma niezmienny miesiąc rezerwacji. Zakończenie lub wyjaśnienie jej kosztu później aktualizuje ten miesiąc; nowa próba w kolejnym miesiącu ma własną rezerwację. Stare rezerwacje nie przechodzą jako nowe wydatki do bieżącego limitu, ale pozostają widoczne jako nierozliczone historyczne zobowiązania. Propozycja SD: Reservation i Usage wskazują jawny budget_month_id, a rozliczenie nie wylicza miesiąca ponownie z czasu zakończenia. Zmiana miesiąca zakłada nowy rekord limitu, nie zeruje starego dziennika. Przelicznik i cennik zapisane przy próbie pozostają wersjonowane; dobór ich wartości jest techniczną częścią przeglądu O-04/O-06.

## Podsumowanie operacji

Propozycja SD: widok operacji korzysta z Operation/Attempt, a podsumowanie z odczytów zapisanych wyników, nowych ofert i terminów aplikacji. Link do zdarzenia prowadzi do właściwej oferty/firmy/raportu. Błąd późniejszego etapu nie usuwa wcześniejszych wyników; ręczne RetryOperation rozpoczyna się od trwałego checkpointu z ponowną kontrolą kosztu.


## Komendy

Nazwy logiczne, nie zamrożone endpointy. Wspólny kontrakt walidacji/wersji/odpowiedzi: [architektura](../../architecture.md#wspólny-kontrakt-komend).

| Komenda | Wejście i skutek |
| --- | --- |
| ChangeBudget / RetryOperation | Limit lub operation id, expected version; historia i ponowna kontrola budżetu. |

## Integracja z pozostałymi funkcjonalnościami

[uruchomienie](../uruchomienie/requirements.md). Ten moduł zapewnia status wykonania, rezerwacje i ponowienia pozostałym funkcjonalnościom; prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Równoległe rezerwacje, timeout po przyjęciu płatnego requestu, granica miesiąca, dwa błędy przejściowe, priorytet ręczny, kill przed/po commit i retencja kolejki. Sprawdzić licznik prób, koszty i brak duplikacji skutków. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-04, O-06 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.

## Pierwszy konsument płatnych operacji: profil — 2026-11-01

Projekt [profilu](../profil/solution-design.md#koszt-i-uruchomienie-płatnej-próby) potrzebuje minimalnego wykonania wspólnych kontraktów Operation/Attempt i rezerwacji przed przygotowaniem propozycji AI. Nie tworzy osobnego budżetu. Przed włączeniem tego adaptera wymagane są atomowa rezerwacja, rzeczywiste usage, stan nieznanego kosztu, niezmienny miesiąc oraz nowa rezerwacja retry. Szczegółowe wartości limitów dla profilu należą do jego SD. Ten dopisek nie oznacza ukończenia modułu operacji ani implementacji researchu.
