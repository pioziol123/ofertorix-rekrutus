# Tożsamość ofert, rozbieżności i historia — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-08/AC-08, R-09/AC-09, R-10/AC-10, R-11/AC-11.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Własność danych i kontrakty

| Encja / grupa | Istotne pola i niezmienniki |
| --- | --- |
| AdRevision | `id`, `source_ad_id`, data pobrania, surowe pola, znormalizowany tekst/pola, hashe, klasyfikacja zmian. Zachować wersje użyte jako wejście AI; nie wymagamy UI dawnych pełnych opisów. |
| Offer / MembershipHistory | Logiczna oferta, przypisania ogłoszeń i historia połączeń/rozdzieleń. Scalenie nie jest kaskadowym usunięciem dawnych identyfikatorów. |
| FieldAssertion | Podmiot, pole, wartość, źródło, zakres, data, autor; `selected_assertion_id` może wskazywać ręcznie obowiązującą wartość. Odczyty źródłowe nie zmieniają ręcznej selekcji. |

## Łączenie i rozdzielanie

Propozycja SD: komenda połączenia wskazuje oferty i ofertę główną, blokuje je w transakcji, przenosi przypisania i zachowuje identyfikatory dawnych ofert jako aliasy/historyczne rekordy. Nie usuwa notatek ani raportów. Rozdzielenie wskazuje podział źródeł i przypisania aplikacji. Wspólne historyczne notatki mogą być dostępne przez wpis połączenia z oryginalnym pochodzeniem, zamiast kopiowania treści bez autora. Walidacja zakazuje utraty aplikacji. **Potwierdzone Q12:** przy dwóch aktywnych aplikacjach wymagana jest decyzja właściciela: ten sam proces czy odrębne rekrutacje. Nie wywnioskowujemy tej tożsamości z samego podobieństwa ofert. Propozycja SD: komenda zawiera jawne rozstrzygnięcie procesów i oczekiwane wersje; bez niego zwraca konflikt wymagający decyzji. Przy jednym procesie zachowuje pochodzenie obu historii i elementów, a przy odrębnych nie scala aplikacji. Dokładną reprezentację odrębnych rekrutacji przy grupowanych ofertach oraz odwracalne przypisania należy przejrzeć przed implementacją; nie można wymusić utraty procesu ograniczeniem bazy.

## Wartości i rozbieżności

Oryginalne pola źródła zachowują jego własną semantykę; mapowanie wersjonuje adapter. Wynagrodzenie: zbiór wariantów z `from/to` nullable, walutą, okresem, typem umowy i podstawą kwoty. Brak dolnej granicy nie oznacza zera. Bez ustalonej podstawy nie zakładać B2B netto wyłącznie z kwoty. Brak automatycznego przeliczenia netto/brutto lub walut w tym projekcie.

Propozycja SD: źródłowy upsert nie nadpisuje ręcznego selected_assertion_id. Zmiana wybranej wartości i jej pochodzenia tworzy zdarzenie historii. Zachowujemy wszystkie sprzeczne warianty i pochodzenie, bez uznania korzystniejszego za jedyny fakt. Kwalifikacja według zaakceptowanej reguły [dopasowania](../dopasowanie/solution-design.md#sprzeczne-warianty) może uznać wymaganie za spełnione na podstawie jednego wariantu; znacznik rozbieżności jest wtedy obowiązkowy.

## Archiwizacja

Potwierdzone Q15: ofertę można archiwizować, zachowując dostęp do historii. Propozycja SD: archiwizacja jest odrębnym znacznikiem logicznej oferty, niezależnym od dostępności/wygaśnięcia ogłoszeń oraz stanu aplikacji. Nie wykonuje DELETE rekordów domenowych ani kaskad usuwających powiązane dane.

## Rewizje i zdarzenia

Propozycja SD: moduł przyjmuje z synchronizacji nową treść i pola ogłoszenia, zachowuje rewizję oraz porównuje znaczące dane. Istotna zmiana atomowo oznacza ocenę jako nieaktualną i zleca operację ponownej oceny przez kontrakt modułu dopasowania/operacji. Zmiany samego formatowania zapisują się bez nowej płatnej oceny. Poprzednie wejścia użytych ocen pozostają dostępne, bez obowiązku budowania przeglądarki pełnych snapshotów.


## Komendy

Nazwy logiczne, nie zamrożone endpointy. Wspólny kontrakt walidacji/wersji/odpowiedzi: [architektura](../../architecture.md#wspólny-kontrakt-komend).

| Komenda | Wejście i skutek |
| --- | --- |
| MergeOffers / SplitOffers | Identyfikatory i oczekiwane wersje; atomowa walidacja przypisań i historia. |

## Integracja z pozostałymi funkcjonalnościami

[pobieranie](../pobieranie/requirements.md), [dopasowanie](../dopasowanie/requirements.md), [rekrutacje](../rekrutacje/requirements.md). Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Ponowny odczyt klucza, dwie podobne oferty, merge/split z aplikacjami, sprzeczne widełki i ręczny wybór, zmiana znacząca vs formatowanie. Sprawdzić kompletność historii i zachowanie przypisań. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-02, O-03 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.
